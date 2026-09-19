'use strict';

const marketplaceService = require('./marketplace.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const create = asyncHandler(async (req, res) => {
  const listing = await marketplaceService.createListing(req.user.id, req.body);
  res.status(201).json({ success: true, data: listing });
});

const discover = asyncHandler(async (req, res) => {
  const result = await marketplaceService.discover(req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const getById = asyncHandler(async (req, res) => {
  const listing = await marketplaceService.getDiscoverableById(req.params.listingId);
  res.status(200).json({ success: true, data: listing });
});

const listMine = asyncHandler(async (req, res) => {
  const result = await marketplaceService.listMine(req.user.id, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const update = asyncHandler(async (req, res) => {
  const listing = await marketplaceService.updateListing(req.listing, req.body);
  res.status(200).json({ success: true, data: listing });
});

const remove = asyncHandler(async (req, res) => {
  await marketplaceService.archiveListing(req.listing);
  res.status(204).send();
});

const moderate = asyncHandler(async (req, res) => {
  const listing = await marketplaceService.moderateListing(req.listing, req.body.status);
  res.status(200).json({ success: true, data: listing });
});

const contact = asyncHandler(async (req, res) => {
  const result = await marketplaceService.contactSeller(req.user.id, req.listing, req.body.message);
  res.status(200).json({ success: true, data: result });
});

const toggleSave = asyncHandler(async (req, res) => {
  const result = await marketplaceService.toggleSave(req.user.id, 'marketplace_listing', req.params.listingId);
  res.status(200).json({ success: true, data: result });
});

const listSaved = asyncHandler(async (req, res) => {
  const result = await marketplaceService.listSaved(req.user.id, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

module.exports = { create, discover, getById, listMine, update, remove, moderate, contact, toggleSave, listSaved };
