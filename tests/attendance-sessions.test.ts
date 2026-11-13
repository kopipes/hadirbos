import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scheduleSnapshot, sessionSchedule, minutesAfter, workDate, formatSessionTime } from '../src/lib/attendance-time';

const directory = mkdtempSync(join(tmpdir(), 'hadirbos-sessions-'));
writeFileSync(join(directory, 'test.db'), '');
process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
process.env.JWT_SECRET = 'test-secret-for-synthetic-session-checks';
process.env.CRON_SECRET = 'synthetic-cron-secret';
const pushed = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, encoding: 'utf8' });
assert.equal(pushed.status, 0, pushed.stderr + pushed.stdout);
const { prisma } = require('../src/lib/prisma');
const { recordAttendance, requestCorrection, reviewCorrection } = require('../src/lib/attendance-service');
const { runSessionReminders } = require('../src/lib/attendance-reminders');
const { backfillAttendanceSessions } = require('../scripts/backfill-attendance-sessions');
const instant = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const stamp = (date: string, time: string) => instant(date, time).toISOString();
const photo = { photo: 'data:image/jpeg;base64,c3ludGhldGlj', latitude: -6.2, longitude: 106.8 };
let employee: any;
let manager: any;
let schedule: any;
const actor = () => ({ userId: employee.id, role: 'USER' });
const reviewer = () => ({ userId: manager.id, role: 'MANAGER' });
async function checkin(date = '2026-11-13', time = '08:00') {
  return recordAttendance(actor(), { ...photo, type: 'checkin' }, instant(date, time));
}
async function checkout(id: string, date = '2026-11-13', time = '17:00') {
  return recordAttendance(actor(), { ...photo, type: 'checkout', attendanceId: id }, instant(date, time));
}

beforeEach(async () => {
  await prisma.notification.deleteMany();
  await prisma.attendanceCorrection.deleteMany();
  await prisma.overtimeApproval.deleteMany();
  await prisma.earlyLeave.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.user.updateMany({ data: { managerId: null } });
  await prisma.user.deleteMany();
  await prisma.workSchedule.deleteMany();
  schedule = await prisma.workSchedule.create({ data: { name: 'Day', checkInTime: '08:00', checkOutTime: '17:00', gracePeriod: 15, overtimeAfter: 30, reviewAfter: 180 } });
  manager = await prisma.user.create({ data: { nik: 'MANAGER', name: 'Synthetic Manager', password: 'not-real', role: 'MANAGER' } });
  employee = await prisma.user.create({ data: { nik: 'EMPLOYEE', name: 'Synthetic Employee', password: 'not-real', managerId: manager.id, workScheduleId: schedule.id } });
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test('day shift checkout after midnight stays on original work date and requests overtime', async () => {
  const session = await checkin();
  const result = await checkout(session.id, '2026-11-14', '01:00');
  assert.equal(result.date, '2026-11-13');
  assert.equal(result.checkoutState, 'CLOSED');
  assert.equal(result.openSessionKey, null);
  assert.equal(result.overtimeStatus, 'PENDING');
  assert.equal(result.overtimeMinutes, 0); // not approved yet
  const approval = await prisma.overtimeApproval.findFirst({ where: { attendanceId: session.id } });
  assert.equal(approval.overtimeMinutes, 480);
  assert.equal(formatSessionTime(result.checkOut, result.date), '01:00 (+1 hari)');
});

test('22:00–06:00 shift ends next day without false overtime', async () => {
  await prisma.workSchedule.update({ where: { id: schedule.id }, data: { checkInTime: '22:00', checkOutTime: '06:00', checkOutNextDay: true } });
  const session = await checkin('2026-11-13', '22:00');
  const result = await checkout(session.id, '2026-11-14', '06:00');
  assert.equal(result.overtimeStatus, 'NONE');
  assert.equal(result.lateMinutes, 0);
  assert.equal(result.scheduledCheckOut.toISOString(), stamp('2026-11-14', '06:00'));
});

test('late after-midnight arrival belongs to prior night shift', async () => {
  await prisma.workSchedule.update({ where: { id: schedule.id }, data: { checkInTime: '22:00', checkOutTime: '06:00', checkOutNextDay: true } });
  const session = await checkin('2026-11-14', '01:00');
  assert.equal(session.date, '2026-11-13');
  assert.equal(session.lateMinutes, 180);
});

test('schedule changes cannot change an existing session calculation', async () => {
  const session = await checkin();
  await prisma.workSchedule.update({ where: { id: schedule.id }, data: { checkOutTime: '23:00', overtimeAfter: 120 } });
  const result = await checkout(session.id, '2026-11-13', '18:00');
  const approval = await prisma.overtimeApproval.findFirst({ where: { attendanceId: result.id } });
  assert.equal(approval.overtimeMinutes, 60);
  assert.equal(result.scheduledCheckOut.toISOString(), stamp('2026-11-13', '17:00'));
});

test('open session blocks another checkin and unique key also protects at DB level', async () => {
  await checkin();
  await assert.rejects(checkin('2026-11-14'), /Selesaikan sesi/);
  await assert.rejects(prisma.attendance.create({ data: { userId: employee.id, date: '2026-11-14', checkIn: instant('2026-11-14', '08:00'), openSessionKey: employee.id } }), (e: any) => e.code === 'P2002');
});

test('concurrent checkins cannot create two live sessions', async () => {
  const results = await Promise.allSettled([checkin(), checkin()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await prisma.attendance.count({ where: { userId: employee.id, openSessionKey: employee.id } }), 1);
});

test('forgotten checkout releases session without inventing time and permits next checkin', async () => {
  const old = await checkin();
  const correction = await requestCorrection(actor(), { attendanceId: old.id, newCheckOut: stamp('2026-11-13', '17:00'), reason: 'Forgot checkout' }, instant('2026-11-14', '07:30'));
  const pending = await prisma.attendance.findUnique({ where: { id: old.id } });
  assert.equal(pending.checkoutState, 'CORRECTION_PENDING');
  assert.equal(pending.checkOut, null);
  assert.equal(pending.openSessionKey, null);
  const current = await checkin('2026-11-14');
  await reviewCorrection(reviewer(), correction.id, 'APPROVED', undefined, instant('2026-11-14', '09:00'));
  const resolved = await prisma.attendance.findUnique({ where: { id: old.id } });
  assert.equal(resolved.checkOut.toISOString(), stamp('2026-11-13', '17:00'));
  assert.equal((await prisma.attendance.findUnique({ where: { id: current.id } })).openSessionKey, employee.id);
});

test('rejected old correction does not hijack newer checkout, and can be resubmitted', async () => {
  const old = await checkin();
  const correction = await requestCorrection(actor(), { attendanceId: old.id, newCheckOut: stamp('2026-11-13', '17:00'), reason: 'Forgot' }, instant('2026-11-14', '07:30'));
  const current = await checkin('2026-11-14');
  await reviewCorrection(reviewer(), correction.id, 'REJECTED', 'Confirm exact time', instant('2026-11-14', '09:00'));
  const result = await checkout(current.id, '2026-11-14');
  assert.equal(result.checkoutState, 'CLOSED');
  await assert.rejects(checkin('2026-11-15'), /Selesaikan sesi/);
  const retry = await requestCorrection(actor(), { attendanceId: old.id, newCheckOut: stamp('2026-11-13', '17:30'), reason: 'Confirmed actual time' }, instant('2026-11-15', '07:30'));
  assert.equal(retry.status, 'PENDING');
  await checkin('2026-11-15');
});

test('corrections reject future, reversed, and overlapping intervals', async () => {
  const old = await checkin();
  await checkout(old.id);
  await checkin('2026-11-14');
  for (const time of [stamp('2026-11-13', '07:00'), stamp('2026-11-14', '08:30'), stamp('2026-11-15', '17:00')]) {
    await assert.rejects(requestCorrection(actor(), { attendanceId: old.id, newCheckOut: time, reason: 'Invalid' }, instant('2026-11-14', '10:00')));
  }
});

test('approval revalidates overlap even if a later session appeared after submission', async () => {
  const old = await checkin();
  await checkout(old.id);
  const correction = await requestCorrection(actor(), { attendanceId: old.id, newCheckOut: stamp('2026-11-14', '09:00'), reason: 'Long overtime' }, instant('2026-11-14', '10:00'));
  // Simulate imported data after proposal, not a legal new checkin through the service.
  await prisma.attendance.create({ data: { userId: employee.id, date: '2026-11-14', checkIn: instant('2026-11-14', '08:00'), openSessionKey: employee.id } });
  await assert.rejects(reviewCorrection(reviewer(), correction.id, 'APPROVED', undefined, instant('2026-11-14', '11:00')), /bertabrakan/);
  assert.equal((await prisma.attendanceCorrection.findUnique({ where: { id: correction.id } })).status, 'PENDING');
});

test('unrelated reviewer cannot approve another team correction', async () => {
  const session = await checkin();
  const correction = await requestCorrection(actor(), { attendanceId: session.id, newCheckOut: stamp('2026-11-13', '17:00'), reason: 'Forgot' }, instant('2026-11-14', '07:30'));
  await assert.rejects(reviewCorrection({ userId: 'unrelated', role: 'MANAGER' }, correction.id, 'APPROVED'), (e: any) => e.status === 403);
});

test('cron scans old sessions, deduplicates reminders, and never sets checkout', async () => {
  const session = await checkin();
  const first = await runSessionReminders(instant('2026-11-16', '06:00'));
  const second = await runSessionReminders(instant('2026-11-16', '06:01'));
  assert.equal(first.autoCheckedOut, 0);
  assert.equal(first.flagged, 1);
  assert.equal(second.flagged, 0);
  assert.equal(second.reminded, 0);
  const result = await prisma.attendance.findUnique({ where: { id: session.id } });
  assert.equal(result.checkOut, null);
  assert.equal(result.needsReview, true);
});

test('overnight shift is not marked late/open at 06:00 before configured review threshold', async () => {
  await prisma.workSchedule.update({ where: { id: schedule.id }, data: { checkInTime: '22:00', checkOutTime: '06:00', checkOutNextDay: true } });
  const session = await checkin('2026-11-13', '22:00');
  const result = await runSessionReminders(instant('2026-11-14', '06:00'));
  assert.equal(result.flagged, 0);
  assert.equal(result.reminded, 0);
  assert.equal((await prisma.attendance.findUnique({ where: { id: session.id } })).checkOut, null);
});

test('backfill preserves timestamps, quarantines duplicate legacy sessions, and is idempotent', async () => {
  await prisma.attendance.create({ data: { userId: employee.id, date: '2026-11-12', checkIn: instant('2026-11-12', '08:00') } });
  const newer = await prisma.attendance.create({ data: { userId: employee.id, date: '2026-11-13', checkIn: instant('2026-11-13', '08:00') } });
  const closed = await prisma.attendance.create({ data: { userId: employee.id, date: '2026-11-11', checkIn: instant('2026-11-11', '08:00'), checkOut: instant('2026-11-12', '01:00') } });
  await backfillAttendanceSessions();
  await backfillAttendanceSessions();
  assert.equal(await prisma.attendance.count({ where: { userId: employee.id, openSessionKey: employee.id } }), 1);
  assert.equal((await prisma.attendance.findUnique({ where: { id: newer.id } })).openSessionKey, employee.id);
  assert.equal((await prisma.attendance.findUnique({ where: { id: closed.id } })).checkOut.toISOString(), closed.checkOut.toISOString());
  assert.equal(await prisma.attendance.count({ where: { checkoutState: 'CORRECTION_REJECTED' } }), 1);
});

test('cron endpoint fails closed and middleware allows its own secret authentication', async () => {
  const { NextRequest } = require('next/server');
  const { attendanceCron } = require('../src/lib/attendance-cron');
  const { middleware } = require('../src/middleware');
  const req = new NextRequest('http://localhost/api/cron/auto-checkout', { method: 'POST', headers: { 'x-cron-secret': 'synthetic-cron-secret' } });
  assert.equal((await middleware(req)).status, 200);
  assert.equal((await attendanceCron(req)).status, 200);
  delete process.env.CRON_SECRET;
  assert.equal((await attendanceCron(req)).status, 401);
  process.env.CRON_SECRET = 'synthetic-cron-secret';
});

test('existing threshold rules remain stable and are independent of host timezone', () => {
  const snapshot = scheduleSnapshot('2026-11-13', { checkInTime: '08:00', checkOutTime: '17:00', gracePeriod: 15, overtimeAfter: 30 });
  const schedule = sessionSchedule({ date: '2026-11-13', ...snapshot });
  assert.equal(minutesAfter(instant('2026-11-13', '08:15'), schedule.start, schedule.grace), 0);
  assert.equal(minutesAfter(instant('2026-11-13', '08:16'), schedule.start, schedule.grace), 16);
  assert.equal(minutesAfter(instant('2026-11-13', '17:31'), schedule.end, schedule.overtimeAfter), 31);
  assert.equal(workDate(instant('2026-11-14', '01:00')), '2026-11-14');
});

test('early checkout requires approved permission on the server', async () => {
  const session = await checkin();
  await assert.rejects(checkout(session.id, '2026-11-13', '16:00'), /izin pulang awal/);
  await prisma.earlyLeave.create({ data: { attendanceId: session.id, userId: employee.id, reason: 'Appointment', status: 'APPROVED', reviewedById: manager.id } });
  assert.equal((await checkout(session.id, '2026-11-13', '16:00')).checkoutState, 'CLOSED');
});

test('a session without a schedule does not acquire new rules when a schedule is assigned later', async () => {
  await prisma.user.update({ where: { id: employee.id }, data: { workScheduleId: null } });
  const session = await checkin('2026-11-13', '10:00');
  await prisma.user.update({ where: { id: employee.id }, data: { workScheduleId: schedule.id } });
  const result = await checkout(session.id, '2026-11-13', '16:00');
  assert.equal(result.lateMinutes, 0);
  assert.equal(result.overtimeStatus, 'NONE');
  assert.equal(result.scheduledCheckOut, null);
});

test('current-session API returns prior-day live session, and own permission is visible to USER', async () => {
  const { NextRequest } = require('next/server');
  const { signToken } = require('../src/lib/auth');
  const attendanceRoute = require('../src/app/api/attendances/route');
  const earlyRoute = require('../src/app/api/early-leave/route');
  const session = await checkin('2026-11-10');
  await prisma.earlyLeave.create({ data: { attendanceId: session.id, userId: employee.id, reason: 'Appointment', status: 'APPROVED' } });
  const token = await signToken({ ...actor(), nik: employee.nik, name: employee.name });
  const headers = { cookie: `hadirbos_token=${token}` };
  const current = await attendanceRoute.GET(new NextRequest('http://localhost/api/attendances?current=true', { headers }));
  assert.equal((await current.json()).data.current.id, session.id);
  const permissions = await earlyRoute.GET(new NextRequest('http://localhost/api/early-leave?self=true', { headers }));
  assert.equal(permissions.status, 200);
  assert.equal((await permissions.json()).data[0].status, 'APPROVED');
});

test('correction detail authorizes owner/team and never exposes password fields', async () => {
  const { NextRequest } = require('next/server');
  const { signToken } = require('../src/lib/auth');
  const route = require('../src/app/api/attendances/corrections/[id]/route');
  const session = await checkin('2026-11-10');
  const correction = await requestCorrection(actor(), { attendanceId: session.id, newCheckOut: stamp('2026-11-10', '17:00'), reason: 'Forgot' }, instant('2026-11-11', '07:00'));
  const token = await signToken({ ...actor(), nik: employee.nik, name: employee.name });
  const own = await route.GET(new NextRequest('http://localhost/api/corrections/id', { headers: { cookie: `hadirbos_token=${token}` } }), { params: { id: correction.id } });
  const data = await own.json();
  assert.equal(data.data.requestedBy.password, undefined);
  const outsider = await signToken({ userId: 'outsider', role: 'USER', nik: 'OTHER', name: 'Other' });
  const forbidden = await route.GET(new NextRequest('http://localhost/api/corrections/id', { headers: { cookie: `hadirbos_token=${outsider}` } }), { params: { id: correction.id } });
  assert.equal(forbidden.status, 403);
});

test('pending checkin-only correction can be approved after normal checkout', async () => {
  const session = await checkin();
  const correction = await requestCorrection(actor(), { attendanceId: session.id, newCheckIn: stamp('2026-11-13', '07:55'), reason: 'Actual arrival' }, instant('2026-11-13', '09:00'));
  await checkout(session.id);
  await reviewCorrection(reviewer(), correction.id, 'APPROVED', undefined, instant('2026-11-14', '09:00'));
  const result = await prisma.attendance.findUnique({ where: { id: session.id } });
  assert.equal(result.checkIn.toISOString(), stamp('2026-11-13', '07:55'));
  assert.equal(result.checkOut.toISOString(), stamp('2026-11-13', '17:00'));
});

test('a stale correction can always be rejected so the user can submit again', async () => {
  const session = await checkin();
  const correction = await requestCorrection(actor(), { attendanceId: session.id, newCheckIn: stamp('2026-11-13', '07:55'), reason: 'Actual arrival' }, instant('2026-11-13', '09:00'));
  await prisma.attendance.update({ where: { id: session.id }, data: { checkIn: instant('2026-11-13', '07:50') } });
  await assert.rejects(reviewCorrection(reviewer(), correction.id, 'APPROVED', undefined, instant('2026-11-14', '09:00')), /berubah/);
  await reviewCorrection(reviewer(), correction.id, 'REJECTED', 'Submit with latest times', instant('2026-11-14', '09:00'));
  assert.equal((await prisma.attendanceCorrection.findUnique({ where: { id: correction.id } })).status, 'REJECTED');
});

test('checkin corrections cannot move a session to another work date', async () => {
  const session = await checkin();
  await assert.rejects(requestCorrection(actor(), { attendanceId: session.id, newCheckIn: stamp('2026-11-12', '08:00'), reason: 'Wrong date' }, instant('2026-11-14', '09:00')), /tanggal kerja/);
  await prisma.workSchedule.update({ where: { id: schedule.id }, data: { checkInTime: '22:00', checkOutTime: '06:00', checkOutNextDay: true } });
  await checkout(session.id);
  const night = await checkin('2026-11-14', '22:00');
  const correction = await requestCorrection(actor(), { attendanceId: night.id, newCheckIn: stamp('2026-11-15', '01:00'), reason: 'After midnight arrival' }, instant('2026-11-15', '02:00'));
  assert.equal(correction.status, 'PENDING');
});

test('checkout from a stale tab cannot close a different live session', async () => {
  const session = await checkin();
  await assert.rejects(checkout('another-session', '2026-11-13', '17:00'), /Sesi kerja berubah/);
  assert.equal((await prisma.attendance.findUnique({ where: { id: session.id } })).checkOut, null);
});
