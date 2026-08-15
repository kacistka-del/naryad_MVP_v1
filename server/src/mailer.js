import 'dotenv/config';

let transportPromise = null;

async function getTransport() {
  if (!process.env.SMTP_URL) return null;
  if (!transportPromise) {
    transportPromise = import('nodemailer')
      .then((mod) => mod.default.createTransport(process.env.SMTP_URL))
      .catch((e) => {
        console.warn('[mail] nodemailer недоступен:', e.message);
        return null;
      });
  }
  return transportPromise;
}

export async function sendMail({ to, subject, text }) {
  const transport = await getTransport();
  if (!transport) {
    console.log(`[mail:dev] → ${to} | ${subject}\n${text}`);
    return { delivered: false };
  }
  await transport.sendMail({
    from: process.env.MAIL_FROM || 'NARYAD <no-reply@naryad.local>',
    to,
    subject,
    text,
  });
  return { delivered: true };
}

export const mailConfigured = () => Boolean(process.env.SMTP_URL);
