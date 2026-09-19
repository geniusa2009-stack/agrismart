'use strict';

/**
 * modules/services/serviceRequests.service.js
 *
 * Lifecycle: requested -> accepted -> in_progress -> completed
 *                                                  \
 *            requested|accepted|in_progress -------> cancelled
 * No double-booking/overlap concern here unlike rentals.service.js —
 * a service request isn't tied to an exclusive equipment time-slot, so
 * the atomic single-document transition() alone is a complete and
 * sufficient concurrency guard for this lifecycle (section 22).
 */

const serviceRequestsRepository = require('./serviceRequests.repository');
const notificationsService = require('../notifications/notifications.service');
const servicesRepository = require('./services.repository');
const reviewsService = require('../trust/reviews.service');
const { resolvePagination, paginatedResponse } = require('../../utils/pagination');
const { ApiError } = require('../../middleware/errorHandler');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

async function requestService(requesterId, service, { preferredDate, message }) {
  if (String(service.providerId) === String(requesterId)) {
    throw ApiError.badRequest('You cannot request your own service.');
  }

  const request = await serviceRequestsRepository.create({
    serviceId: service._id,
    providerId: service.providerId,
    requesterId,
    preferredDate,
    pricingUnit: service.pricing.unit,
    priceQuoted: service.pricing.amount,
    message,
  });

  metrics.increment('service_requested_total');
  logger.info({ requestId: String(request._id), serviceId: String(service._id), requesterId }, 'service_requested');
  await notificationsService.notify({
    userId: service.providerId,
    type: 'service_requested',
    data: { requestId: String(request._id), serviceId: String(service._id) },
  });
  return request;
}

async function acceptRequest(actorId, request) {
  if (String(request.providerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the service provider can accept a request.');
  }
  const updated = await serviceRequestsRepository.transition(request._id, ['requested'], 'accepted', {
    respondedBy: actorId,
    respondedAt: new Date(),
  });
  if (!updated) throw ApiError.conflict('This request is no longer pending.');
  metrics.increment('service_accepted_total');
  await notificationsService.notify({ userId: request.requesterId, type: 'service_accepted', data: { requestId: String(request._id) } });
  return updated;
}

async function rejectRequest(actorId, request, { responseNote }) {
  if (String(request.providerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the service provider can reject a request.');
  }
  const updated = await serviceRequestsRepository.transition(request._id, ['requested'], 'rejected', {
    respondedBy: actorId,
    respondedAt: new Date(),
    responseNote,
  });
  if (!updated) throw ApiError.conflict('This request is no longer pending.');
  metrics.increment('service_rejected_total');
  await notificationsService.notify({ userId: request.requesterId, type: 'service_rejected', data: { requestId: String(request._id) } });
  return updated;
}

async function startRequest(actorId, request) {
  if (String(request.providerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the service provider can start this service.');
  }
  const updated = await serviceRequestsRepository.transition(request._id, ['accepted'], 'in_progress', {
    startedAt: new Date(),
  });
  if (!updated) throw ApiError.conflict('Only an accepted request can be started.');
  return updated;
}

async function completeRequest(actorId, request) {
  if (String(request.providerId) !== String(actorId)) {
    throw ApiError.forbidden('Only the service provider can mark this service as completed.');
  }
  const updated = await serviceRequestsRepository.transition(request._id, ['in_progress', 'accepted'], 'completed', {
    completedAt: new Date(),
  });
  if (!updated) throw ApiError.conflict('Only an accepted or in-progress request can be completed.');
  metrics.increment('service_completed_total');
  await notificationsService.notify({ userId: request.requesterId, type: 'service_completed', data: { requestId: String(request._id) } });
  return updated;
}

async function cancelRequest(actorId, request) {
  const isProvider = String(request.providerId) === String(actorId);
  const isRequester = String(request.requesterId) === String(actorId);
  if (!isProvider && !isRequester) {
    throw ApiError.forbidden('You are not a participant in this service request.');
  }
  const updated = await serviceRequestsRepository.transition(
    request._id,
    ['requested', 'accepted', 'in_progress'],
    'cancelled',
    { cancelledBy: actorId, cancelledAt: new Date() }
  );
  if (!updated) throw ApiError.conflict('This request can no longer be cancelled.');
  const notifyUserId = isProvider ? request.requesterId : request.providerId;
  await notificationsService.notify({ userId: notifyUserId, type: 'service_cancelled', data: { requestId: String(request._id) } });
  return updated;
}

async function reviewRequest(reviewerId, request, { rating, comment }) {
  if (String(request.requesterId) !== String(reviewerId)) {
    throw ApiError.forbidden('Only the person who requested this service can review it.');
  }
  if (request.status !== 'completed') {
    throw ApiError.badRequest('You can only review a service after it has been completed.');
  }
  const review = await reviewsService.submitReview(
    {
      reviewerId,
      revieweeId: request.providerId,
      transactionType: 'service_request',
      transactionId: request._id,
      targetType: 'service',
      targetId: request.serviceId,
      rating,
      comment,
    },
    async (aggregate) => {
      await servicesRepository.applyRatingDelta(request.serviceId, { newAverage: aggregate.average, newCount: aggregate.count });
    }
  );
  await serviceRequestsRepository.markReviewed(request._id);
  return review;
}

async function listMine(userId, query, roleFilter) {
  const { page, limit, skip } = resolvePagination(query);
  const opts = { status: query.status, skip, limit };
  const { items, total } =
    roleFilter === 'provider'
      ? await serviceRequestsRepository.listForProvider(userId, opts)
      : await serviceRequestsRepository.listForRequester(userId, opts);
  return paginatedResponse(items, total, { page, limit });
}

module.exports = {
  requestService,
  acceptRequest,
  rejectRequest,
  startRequest,
  completeRequest,
  cancelRequest,
  reviewRequest,
  listMine,
};
