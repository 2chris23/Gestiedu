import nodemailer from 'nodemailer';
import { config } from '../config/environment';
import { logger } from './logger';

// Configuración del transporte de email
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465, // true para puerto 465, false para otros puertos
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

// Enviar email
export async function sendEmail({ to, subject, text, html }: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<void> {
  try {
    await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      text,
      html,
    });
    logger.info(`Email enviado a: ${to}`);
  } catch (error) {
    logger.error('Error al enviar email:', error);
    throw new Error('Error al enviar email');
  }
}
