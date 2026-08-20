import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create office
  const office = await prisma.office.upsert({
    where: { id: 'office-hq' },
    update: {},
    create: {
      id: 'office-hq',
      name: 'Kantor Pusat',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
      latitude: -6.2088,
      longitude: 106.8456,
      radius: 200,
    },
  });

  // Create work schedule
  const schedule = await prisma.workSchedule.upsert({
    where: { id: 'schedule-default' },
    update: {},
    create: {
      id: 'schedule-default',
      name: 'Reguler (08:00 - 17:00)',
      checkInTime: '08:00',
      checkOutTime: '17:00',
      gracePeriod: 15,
      overtimeAfter: 30,
      workDays: '1,2,3,4,5',
      officeId: office.id,
    },
  });

  // Create admin
  const adminPass = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { nik: 'ADM001' },
    update: {},
    create: {
      nik: 'ADM001',
      name: 'Admin HadirBos',
      email: 'admin@hadirbos.id',
      phone: '081200000001',
      position: 'HR Administrator',
      department: 'HR',
      role: 'ADMIN',
      password: adminPass,
      officeId: office.id,
      workScheduleId: schedule.id,
    },
  });

  // Create manager
  const mgrPass = await bcrypt.hash('manager123', 12);
  const manager = await prisma.user.upsert({
    where: { nik: 'MGR001' },
    update: {},
    create: {
      nik: 'MGR001',
      name: 'Budi Santoso',
      email: 'budi@hadirbos.id',
      phone: '081200000002',
      position: 'Engineering Manager',
      department: 'Engineering',
      role: 'MANAGER',
      password: mgrPass,
      officeId: office.id,
      workScheduleId: schedule.id,
    },
  });

  // Create SPV
  const spvPass = await bcrypt.hash('spv123', 12);
  const spv = await prisma.user.upsert({
    where: { nik: 'SPV001' },
    update: {},
    create: {
      nik: 'SPV001',
      name: 'Siti Rahayu',
      email: 'siti@hadirbos.id',
      phone: '081200000003',
      position: 'Team Lead Frontend',
      department: 'Engineering',
      role: 'SPV',
      password: spvPass,
      managerId: manager.id,
      officeId: office.id,
      workScheduleId: schedule.id,
    },
  });

  // Create employees
  const empPass = await bcrypt.hash('user123', 12);
  const employees = [
    { nik: 'EMP001', name: 'Andi Wijaya', email: 'andi@hadirbos.id', phone: '081200000004', position: 'Frontend Developer' },
    { nik: 'EMP002', name: 'Dewi Kusuma', email: 'dewi@hadirbos.id', phone: '081200000005', position: 'Backend Developer' },
    { nik: 'EMP003', name: 'Fajar Nugroho', email: 'fajar@hadirbos.id', phone: '081200000006', position: 'QA Engineer' },
    { nik: 'EMP004', name: 'Lina Permata', email: 'lina@hadirbos.id', phone: '081200000007', position: 'UI/UX Designer' },
    { nik: 'EMP005', name: 'Rizky Pratama', email: 'rizky@hadirbos.id', phone: '081200000008', position: 'DevOps Engineer' },
  ];

  for (const emp of employees) {
    await prisma.user.upsert({
      where: { nik: emp.nik },
      update: {},
      create: {
        ...emp,
        department: 'Engineering',
        role: 'USER',
        password: empPass,
        managerId: spv.id,
        officeId: office.id,
        workScheduleId: schedule.id,
      },
    });
  }

  // Create marketing department
  const mktPass = await bcrypt.hash('user123', 12);
  const mktManager = await prisma.user.upsert({
    where: { nik: 'MGR002' },
    update: {},
    create: {
      nik: 'MGR002',
      name: 'Hendra Gunawan',
      email: 'hendra@hadirbos.id',
      phone: '081200000009',
      position: 'Marketing Manager',
      department: 'Marketing',
      role: 'MANAGER',
      password: mgrPass,
      officeId: office.id,
      workScheduleId: schedule.id,
    },
  });

  const mktEmployees = [
    { nik: 'MKT001', name: 'Putri Anggraini', position: 'Marketing Executive' },
    { nik: 'MKT002', name: 'Doni Saputra', position: 'Brand Designer' },
    { nik: 'MKT003', name: 'Yuni Astuti', position: 'Content Creator' },
  ];
  for (const emp of mktEmployees) {
    await prisma.user.upsert({
      where: { nik: emp.nik },
      update: {},
      create: {
        nik: emp.nik,
        name: emp.name,
        email: `${emp.nik.toLowerCase()}@hadirbos.id`,
        department: 'Marketing',
        position: emp.position,
        role: 'USER',
        password: mktPass,
        managerId: mktManager.id,
        officeId: office.id,
        workScheduleId: schedule.id,
      },
    });
  }

  // Seed holidays
  const holidays = [
    { name: 'Tahun Baru', date: '2026-01-01' },
    { name: 'Isra Miraj', date: '2026-01-27' },
    { name: 'Hari Raya Nyepi', date: '2026-03-19' },
    { name: 'Wafat Isa Al Masih', date: '2026-04-03' },
    { name: 'Hari Raya Idul Fitri 1', date: '2026-03-30' },
    { name: 'Hari Raya Idul Fitri 2', date: '2026-03-31' },
    { name: 'Hari Buruh', date: '2026-05-01' },
    { name: 'Kenaikan Isa Al Masih', date: '2026-05-14' },
    { name: 'Hari Lahir Pancasila', date: '2026-06-01' },
    { name: 'Hari Raya Idul Adha', date: '2026-06-06' },
    { name: 'Tahun Baru Islam', date: '2026-06-26' },
    { name: 'Hari Kemerdekaan RI', date: '2026-08-17' },
    { name: 'Maulid Nabi Muhammad', date: '2026-09-04' },
    { name: 'Hari Natal', date: '2026-12-25' },
  ];

  for (const h of holidays) {
    await prisma.holiday.upsert({
      where: { id: `holiday-${h.date}` },
      update: {},
      create: { id: `holiday-${h.date}`, ...h },
    });
  }

  // Seed sample attendance for the past 7 days
  const allUsers = await prisma.user.findMany({ where: { role: 'USER', isActive: true } });
  const today = new Date();

  for (let d = 6; d >= 0; d--) {
    const dateObj = new Date(today);
    dateObj.setDate(today.getDate() - d);
    const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

    const dateStr = dateObj.toISOString().split('T')[0];

    for (const user of allUsers) {
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: user.id, date: dateStr } },
      });
      if (existing) continue;

      // Random scenarios
      const rand = Math.random();
      if (rand < 0.05) continue; // 5% absent

      const checkInHour = rand < 0.2 ? 8 + Math.floor(Math.random() * 2) : 8; // 20% late
      const checkInMin = rand < 0.2 ? 15 + Math.floor(Math.random() * 45) : Math.floor(Math.random() * 15);
      const checkIn = new Date(dateObj);
      checkIn.setHours(checkInHour, checkInMin, 0, 0);

      const checkOutHour = rand < 0.15 ? 17 + Math.floor(Math.random() * 2) : 17;
      const checkOutMin = rand < 0.15 ? 30 + Math.floor(Math.random() * 30) : Math.floor(Math.random() * 30);
      const checkOut = new Date(dateObj);
      checkOut.setHours(checkOutHour, checkOutMin, 0, 0);

      const isLate = checkInHour > 8 || (checkInHour === 8 && checkInMin > 15);
      const lateMinutes = isLate ? (checkInHour - 8) * 60 + checkInMin - 15 : 0;
      const isOvertime = checkOutHour > 17 || (checkOutHour === 17 && checkOutMin > 30);
      const overtimeMinutes = isOvertime ? (checkOutHour - 17) * 60 + checkOutMin : 0;

      await prisma.attendance.create({
        data: {
          userId: user.id,
          date: dateStr,
          checkIn,
          checkOut,
          checkInLat: -6.2088 + (Math.random() - 0.5) * 0.001,
          checkInLng: 106.8456 + (Math.random() - 0.5) * 0.001,
          checkOutLat: -6.2088 + (Math.random() - 0.5) * 0.001,
          checkOutLng: 106.8456 + (Math.random() - 0.5) * 0.001,
          checkInAddress: 'Jl. Sudirman No. 1, Jakarta',
          checkOutAddress: 'Jl. Sudirman No. 1, Jakarta',
          isLate,
          lateMinutes,
          isOvertime,
          overtimeMinutes,
          status: 'PRESENT',
        },
      });
    }
  }

  console.log('✅ Seeding complete!');
  console.log('');
  console.log('Demo accounts:');
  console.log('  Admin:   NIK=ADM001  password=admin123');
  console.log('  Manager: NIK=MGR001  password=manager123');
  console.log('  SPV:     NIK=SPV001  password=spv123');
  console.log('  User:    NIK=EMP001  password=user123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
