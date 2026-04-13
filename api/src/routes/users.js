const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { sendInviteEmail } = require('../lib/email');

const router = express.Router();

// GET /api/users - list all users (super_admin only)
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        invitedBy: true,
        costCenterOwners: {
          include: { costCenter: { select: { id: true, name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users.map(u => ({
      ...u,
      costCenters: u.costCenterOwners.map(o => o.costCenter),
      costCenterOwners: undefined
    })));
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/invite - invite a user (super_admin only)
router.post('/invite', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['super_admin', 'cost_center_owner']).default('cost_center_owner'),
    costCenterIds: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const { email, role, costCenterIds } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'User with this email already exists' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const inviter = await prisma.user.findUnique({ where: { id: req.user.id } });

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: '',
        name: email.split('@')[0],
        role,
        isActive: false,
        invitedBy: req.user.id,
        inviteToken: token,
        inviteExpiry: expiry
      }
    });

    if (costCenterIds && costCenterIds.length > 0) {
      await prisma.costCenterOwner.createMany({
        data: costCenterIds.map(ccId => ({
          costCenterId: ccId,
          userId: user.id,
          assignedBy: req.user.id
        })),
        skipDuplicates: true
      });
    }

    const inviteLink = `${process.env.APP_URL}/invite?token=${token}`;
    await sendInviteEmail(email, inviteLink, inviter?.name || 'An admin');

    await logAudit(req.user.id, 'USER_INVITED', 'user', user.id, { email, role }, getClientIp(req));

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      message: 'Invitation sent'
    });
  } catch (err) {
    console.error('Invite user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id - update user (super_admin only)
router.patch('/:id', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    role: z.enum(['super_admin', 'cost_center_owner']).optional(),
    isActive: z.boolean().optional(),
    costCenterIds: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { costCenterIds, ...updateData } = parsed.data;

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    if (costCenterIds !== undefined) {
      await prisma.costCenterOwner.deleteMany({ where: { userId: req.params.id } });
      if (costCenterIds.length > 0) {
        await prisma.costCenterOwner.createMany({
          data: costCenterIds.map(ccId => ({
            costCenterId: ccId,
            userId: req.params.id,
            assignedBy: req.user.id
          })),
          skipDuplicates: true
        });
      }
    }

    await logAudit(req.user.id, 'USER_UPDATED', 'user', req.params.id, parsed.data, getClientIp(req));

    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id - deactivate user (super_admin only)
router.delete('/:id', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    await prisma.refreshToken.deleteMany({ where: { userId: req.params.id } });

    await logAudit(req.user.id, 'USER_DEACTIVATED', 'user', req.params.id, {}, getClientIp(req));

    res.json({ message: 'User deactivated' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
