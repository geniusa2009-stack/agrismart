'use strict';

const CommunityReport = require('./report.model');

async function create({ reporterId, targetType, targetId, reason, description }) {
  return CommunityReport.create({ reporterId, targetType, targetId, reason, description });
}

async function listQueue({ status, skip, limit }) {
  const query = status ? { status } : {};
  const [items, total] = await Promise.all([
    CommunityReport.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CommunityReport.countDocuments(query),
  ]);
  return { items, total };
}

async function findById(reportId) {
  return CommunityReport.findById(reportId);
}

async function resolve(reportId, { status, resolvedBy, resolutionNote }) {
  return CommunityReport.findByIdAndUpdate(
    reportId,
    { $set: { status, resolvedBy, resolvedAt: new Date(), resolutionNote } },
    { new: true }
  );
}

module.exports = { create, listQueue, findById, resolve };
