import bcrypt from 'bcryptjs';

async function main() {
    const plaintext = process.argv[2];

    if (!plaintext) {
        console.error('Usage: npx tsx scripts/hash-demo-password.ts <password>');
        process.exit(1);
    }

    const hash = await bcrypt.hash(plaintext, 10);
    console.log(hash);
}

void main();
