'use strict';

const serviceRequestsService = require('./serviceRequests.service');
const serviceRequestsRepository = require('./serviceRequests.repository');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

const create = asyncHandler(async (req, res) => {
  const request = await serviceRequestsService.requestService(req.user.id, req.service, req.body);
  res.status(201).json({ success: true, data: request });
});

const listMine = asyncHandler(async (req, res) => {
  const roleFilter = req.query.as === 'provider' ? 'provider' : 'requester';
  const result = await serviceRequestsService.listMine(req.user.id, req.query, roleFilter);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { action, responseNote } = req.body;
  let request;
  if (action === 'accept') request = await serviceRequestsService.acceptRequest(req.user.id, req.serviceRequest);
  else if (action === 'reject') request = await serviceRequestsService.rejectRequest(req.user.id, req.serviceRequest, { responseNote });
  else if (action === 'start') request = await serviceRequestsService.startRequest(req.user.id, req.serviceRequest);
  else if (action === 'complete') request = await serviceRequestsService.completeRequest(req.user.id, req.serviceRequest);
  else if (action === 'cancel') request = await serviceRequestsService.cancelRequest(req.user.id, req.serviceRequest);
  res.status(200).json({ success: true, data: request });
});

const review = asyncHandler(async (req, res) => {
  const result = await serviceRequestsService.reviewRequest(req.user.id, req.serviceRequest, req.body);
  res.status(201).json({ success: true, data: result });
});

const loadParticipantRequest = asyncHandler(async (req, res, next) => {
  const request = await serviceRequestsRepository.findByIdPlain(req.params.requestId);
  if (!request) {
    throw ApiError.notFound('Service request not found.');
  }
  const isProvider = String(request.providerId) === String(req.user.id);
  const isRequester = String(request.requesterId) === String(req.user.id);
  if (!isProvider && !isRequester) {
    throw ApiError.notFound('Service request not found.');
  }
  req.serviceRequest = request;
  next();
});

module.exports = { create, listMine, updateStatus, review, loadParticipantRequest };
