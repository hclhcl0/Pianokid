"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const admin = await prisma.user.create({
        data: { name: 'Admin', role: 'ADMIN' },
    });
    const parent = await prisma.user.create({
        data: { name: 'Parent Demo', role: 'PARENT' },
    });
    const kid1 = await prisma.user.create({
        data: { name: 'Alice', role: 'KID', parentId: parent.id },
    });
    const kid2 = await prisma.user.create({
        data: { name: 'Bob', role: 'KID', parentId: parent.id },
    });
    await prisma.lesson.createMany({
        data: [
            {
                title: 'Twinkle Twinkle',
                level: 1,
                tempo: 80,
                midiJsonUrl: 'https://example.com/twinkle.json',
                isPublished: true,
            },
            {
                title: 'Happy Birthday',
                level: 1,
                tempo: 90,
                midiJsonUrl: 'https://example.com/happy-birthday.json',
                isPublished: true,
            },
            {
                title: 'Mary Had a Little Lamb',
                level: 2,
                tempo: 100,
                midiJsonUrl: 'https://example.com/mary-lamb.json',
                isPublished: true,
            },
        ],
    });
    console.log('Seeded database successfully');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
