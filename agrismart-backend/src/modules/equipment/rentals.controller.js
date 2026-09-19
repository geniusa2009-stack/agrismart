'use strict';

const rentalsService = require('./rentals.service');
const rentalsRepository = require('./rentals.repository');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');

/**
 * Anti-IDOR loader for /rentals/:rentalId routes: 404s (never 403,
 * same anti-enumeration reasoning as authorizeOwnership.js) unless the
 * authenticated user is either the equipment owner OR the requester on
 * this specific rental request. Attaches req.rental. The FINER-grained
 * "only the owner may accept/reject/complete" rule is then enforced a
 * second time inside rentals.service.js itself — this middleware only
 * establishes "you are a participant at all", not "you may do this
 * specific action".
 */
const loadParticipantRental = asyncHandler(async (req, res, next) => {
  const rental = await rentalsRepository.findByIdPlain(req.params.rentalId);
  if (!rental) {
    throw ApiError.notFound('Rental request not found.');
  }
  const isOwner = String(rental.ownerId) === String(req.user.id);
  const isRequester = String(rental.requesterId) === String(req.user.id);
  if (!isOwner && !isRequester) {
    throw ApiError.notFound('Rental request not found.');
  }
  req.rental = rental;
  next();
});

// req.equipment attached by equipmentController.loadDiscoverableEquipment.
const create = asyncHandler(async (req, res) => {
  const rental = await rentalsService.requestRental(req.user.id, req.equipment, req.body);
  res.status(201).json({ success: true, data: rental });
});

const listMine = asyncHandler(async (req, res) => {
  const roleFilter = req.query.as === 'owner' ? 'owner' : 'requester';
  const result = await rentalsService.listMine(req.user.id, req.query, roleFilter);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

// req.rental attached by rentals.routes.js's participant-loader
// middleware; the specific action's authorization (owner-only for
// accept/reject/complete) is enforced a second time inside the
// service layer itself — never trusting the route alone.
const updateStatus = asyncHandler(async (req, res) => {
  const { action, responseNote } = req.body;
  let rental;
  if (action === 'accept') {
    rental = await rentalsService.acceptRental(req.user.id, req.rental);
  } else if (action === 'reject') {
    rental = await rentalsService.rejectRental(req.user.id, req.rental, { responseNote });
  } else if (action === 'cancel') {
    rental = await rentalsService.cancelRental(req.user.id, req.rental);
  } else if (action === 'complete') {
    rental = await rentalsService.completeRental(req.user.id, req.rental);
  }
  res.status(200).json({ success: true, data: rental });
});

const review = asyncHandler(async (req, res) => {
  const result = await rentalsService.reviewRental(req.user.id, req.rental, req.body);
  res.status(201).json({ success: true, data: result });
});

module.exports = { create, listMine, updateStatus, review, loadParticipantRental };
