import bcrypt from 'bcryptjs'

const plaintext = process.argv[2]
if (!plaintext) {
  console.error('Usage: tsx scripts/hash-demo-password.ts <plaintext>')
  process.exit(1)
}
const hash = await bcrypt.hash(plaintext, 10)
console.log(hash)
