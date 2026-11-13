import { NextRequest, NextResponse } from 'next/server';
import { runSessionReminders } from '@/lib/attendance-reminders';

export async function attendanceCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, ...await runSessionReminders(), time: new Date().toISOString() });
  } catch (error) {
    console.error('[ATTENDANCE CRON]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
