import * as nodemailer from 'nodemailer';
import config from '../config/environment';
import { ServiceUnavailableError } from '../utils/errors';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter!: nodemailer.Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailCfg = config.email;
    const emailConfig = {
      host: emailCfg.host || 'localhost',
      port: emailCfg.port || 587,
      secure: (emailCfg.port || 587) === 465, // true for 465, false otherwise
      auth: emailCfg.user && emailCfg.pass ? { user: emailCfg.user, pass: emailCfg.pass } : undefined
    } as nodemailer.TransportOptions;

    this.transporter = nodemailer.createTransport(emailConfig);
  }

  // Enviar email genérico
  async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string,
    attachments?: any[]
  ): Promise<void> {
    try {
      const mailOptions = {
        from: config.email.from || 'noreply@sistema-escolar.com',
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text: text || this.stripHtml(html),
        attachments
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error enviando email:', error);
      throw new ServiceUnavailableError('Email');
    }
  }

  // Enviar email de bienvenida
  async sendWelcomeEmail(
    email: string,
    name: string,
    tempPassword: string,
    instituteName: string
  ): Promise<void> {
    const template = this.getWelcomeTemplate(name, tempPassword, instituteName);
    await this.sendEmail(email, template.subject, template.html, template.text);
  }

  // Enviar email de restablecimiento de contraseña
  async sendPasswordResetEmail(
    email: string,
    name: string,
    resetToken: string,
    resetUrl: string
  ): Promise<void> {
    const template = this.getPasswordResetTemplate(name, resetToken, resetUrl);
    await this.sendEmail(email, template.subject, template.html, template.text);
  }

  // Enviar email de notificación
  async sendNotificationEmail(
    email: string,
    name: string,
    title: string,
    message: string,
    type: string
  ): Promise<void> {
    const template = this.getNotificationTemplate(name, title, message, type);
    await this.sendEmail(email, template.subject, template.html, template.text);
  }

  // Enviar recordatorio de actividad
  async sendActivityReminderEmail(
    email: string,
    studentName: string,
    activityTitle: string,
    activityType: string,
    dueDate: Date,
    className: string
  ): Promise<void> {
    const template = this.getActivityReminderTemplate(
      studentName,
      activityTitle,
      activityType,
      dueDate,
      className
    );
    await this.sendEmail(email, template.subject, template.html, template.text);
  }

  // Enviar reporte de calificaciones
  async sendGradeReportEmail(
    email: string,
    parentName: string,
    studentName: string,
    period: string,
    grades: any[],
    instituteName: string
  ): Promise<void> {
    const template = this.getGradeReportTemplate(
      parentName,
      studentName,
      period,
      grades,
      instituteName
    );
    await this.sendEmail(email, template.subject, template.html, template.text);
  }

  // Enviar reporte de asistencia
  async sendAttendanceReportEmail(
    email: string,
    parentName: string,
    studentName: string,
    attendanceData: any,
    instituteName: string
  ): Promise<void> {
    const template = this.getAttendanceReportTemplate(
      parentName,
      studentName,
      attendanceData,
      instituteName
    );
    await this.sendEmail(email, template.subject, template.html, template.text);
  }

  // Enviar emails masivos
  async sendBulkEmails(
    recipients: Array<{ email: string; name: string; data?: any }>,
    subject: string,
    templateFunction: (name: string, data?: any) => EmailTemplate
  ): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
    let sent = 0;
    const failed: { email: string; error: string }[] = [];

    for (const recipient of recipients) {
      try {
        const template = templateFunction(recipient.name, recipient.data);
        await this.sendEmail(recipient.email, subject, template.html, template.text);
        sent++;
      } catch (error) {
        failed.push({
          email: recipient.email,
          error: (error as Error).message
        });
      }
    }

    return { sent, failed };
  }

  // Templates de email
  private getWelcomeTemplate(name: string, tempPassword: string, instituteName: string): EmailTemplate {
    const subject = `Bienvenido a ${instituteName} - Sistema de Gestión Escolar`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .credentials { background: white; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
          .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Bienvenido a ${instituteName}!</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${name}</strong>,</p>
            <p>Tu cuenta en el Sistema de Gestión Escolar ha sido creada exitosamente.</p>
            
            <div class="credentials">
              <h3>Tus credenciales de acceso:</h3>
              <p><strong>Contraseña temporal:</strong> ${tempPassword}</p>
              <p style="color: #e11d48; font-weight: bold;">⚠️ Por seguridad, cambia tu contraseña en tu primer inicio de sesión.</p>
            </div>
            
            <p>Con tu cuenta podrás:</p>
            <ul>
              <li>Consultar calificaciones y actividades</li>
              <li>Ver el horario de clases</li>
              <li>Recibir notificaciones importantes</li>
              <li>Acceder a reportes y estadísticas</li>
            </ul>
            
            <p style="text-align: center; margin: 30px 0;">
              <a href="#" class="button">Iniciar Sesión</a>
            </p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no responder.</p>
            <p>© 2024 ${instituteName} - Sistema de Gestión Escolar</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      ¡Bienvenido a ${instituteName}!
      
      Hola ${name},
      
      Tu cuenta en el Sistema de Gestión Escolar ha sido creada exitosamente.
      
      Tus credenciales de acceso:
      Contraseña temporal: ${tempPassword}
      
      IMPORTANTE: Por seguridad, cambia tu contraseña en tu primer inicio de sesión.
      
      © 2024 ${instituteName} - Sistema de Gestión Escolar
    `;

    return { subject, html, text };
  }

  private getPasswordResetTemplate(name: string, resetToken: string, resetUrl: string): EmailTemplate {
    const subject = 'Restablecer Contraseña - Sistema de Gestión Escolar';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ef4444; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .warning { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
          .button { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Restablecer Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${name}</strong>,</p>
            <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
            
            <div class="warning">
              <p><strong>⚠️ Importante:</strong></p>
              <ul>
                <li>Este enlace es válido por 1 hora</li>
                <li>Solo se puede usar una vez</li>
                <li>Si no solicitaste este cambio, ignora este email</li>
              </ul>
            </div>
            
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}?token=${resetToken}" class="button">Restablecer Contraseña</a>
            </p>
            
            <p>O copia y pega este enlace en tu navegador:</p>
            <p style="word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 5px;">
              ${resetUrl}?token=${resetToken}
            </p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no responder.</p>
            <p>© 2024 Sistema de Gestión Escolar</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Restablecer Contraseña
      
      Hola ${name},
      
      Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.
      
      Enlace para restablecer: ${resetUrl}?token=${resetToken}
      
      Este enlace es válido por 1 hora y solo se puede usar una vez.
      Si no solicitaste este cambio, ignora este email.
      
      © 2024 Sistema de Gestión Escolar
    `;

    return { subject, html, text };
  }

  private getNotificationTemplate(name: string, title: string, message: string, type: string): EmailTemplate {
    const typeColors: Record<string, string> = {
      INFO: '#3b82f6',
      WARNING: '#f59e0b',
      SUCCESS: '#10b981',
      ERROR: '#ef4444',
      REMINDER: '#8b5cf6'
    };

    const color = typeColors[type] || '#6b7280';
    const subject = `🔔 ${title} - Sistema de Gestión Escolar`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${color}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .message { background: white; padding: 20px; border-left: 4px solid ${color}; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${name}</strong>,</p>
            
            <div class="message">
              <p>${message}</p>
            </div>
            
            <p>Si tienes alguna pregunta, contacta con tu institución educativa.</p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no responder.</p>
            <p>© 2024 Sistema de Gestión Escolar</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      ${title}
      
      Hola ${name},
      
      ${message}
      
      Si tienes alguna pregunta, contacta con tu institución educativa.
      
      © 2024 Sistema de Gestión Escolar
    `;

    return { subject, html, text };
  }

  private getActivityReminderTemplate(
    studentName: string,
    activityTitle: string,
    activityType: string,
    dueDate: Date,
    className: string
  ): EmailTemplate {
    const subject = `📅 Recordatorio: ${activityTitle} - ${className}`;
    const formattedDate = dueDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .activity-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .date-highlight { background: #fef3c7; padding: 10px; border-radius: 5px; text-align: center; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 Recordatorio de Actividad</h1>
          </div>
          <div class="content">
            <p>Estimado padre/madre de <strong>${studentName}</strong>,</p>
            <p>Este es un recordatorio sobre una próxima actividad académica:</p>
            
            <div class="activity-info">
              <h3>${activityTitle}</h3>
              <p><strong>Tipo:</strong> ${activityType}</p>
              <p><strong>Clase:</strong> ${className}</p>
              <p><strong>Estudiante:</strong> ${studentName}</p>
              
              <div class="date-highlight">
                <p>Fecha límite: ${formattedDate}</p>
              </div>
            </div>
            
            <p>Por favor, asegúrese de que ${studentName} esté preparado para esta actividad.</p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no responder.</p>
            <p>© 2024 Sistema de Gestión Escolar</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Recordatorio de Actividad
      
      Estimado padre/madre de ${studentName},
      
      Este es un recordatorio sobre una próxima actividad académica:
      
      Actividad: ${activityTitle},
      Tipo: ${activityType},
      Clase: ${className},
      Estudiante: ${studentName}
      Fecha límite: ${formattedDate}
      
      Por favor, asegúrese de que ${studentName} esté preparado para esta actividad.
      
      © 2024 Sistema de Gestión Escolar
    `;

    return { subject, html, text };
  }

  private getGradeReportTemplate(
    parentName: string,
    studentName: string,
    period: string,
    grades: any[],
    instituteName: string
  ): EmailTemplate {
    const subject = `📈 Reporte de Calificaciones - ${studentName} (${period})`;

    const gradesHtml = grades.map(grade => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${grade.subject}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${grade.score}/20</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${grade.status}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .grades-table { width: 100%; border-collapse: collapse; background: white; margin: 20px 0; }
          .grades-table th { background: #f3f4f6; padding: 12px; text-align: left; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📈 Reporte de Calificaciones</h1>
            <p>${instituteName}</p>
          </div>
          <div class="content">
            <p>Estimado/a <strong>${parentName}</strong>,</p>
            <p>A continuación encontrará el reporte de calificaciones de <strong>${studentName}</strong> correspondiente al período <strong>${period}</strong>:</p>
            
            <table class="grades-table">
              <thead>
                <tr>
                  <th>Materia</th>
                  <th style="text-align: center;">Calificación</th>
                  <th style="text-align: center;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${gradesHtml}
              </tbody>
            </table>
            
            <p>Si tiene alguna consulta sobre estas calificaciones, no dude en contactar con la institución.</p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no responder.</p>
            <p>© 2024 ${instituteName}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const gradesText = grades.map(grade => `${grade.subject}: ${grade.score}/20 (${grade.status})`).join('\n');

    const text = `
      Reporte de Calificaciones - ${instituteName}
      
      Estimado/a ${parentName},
      
      Reporte de calificaciones de ${studentName} - Período: ${period}
      
      ${gradesText}
      
      Si tiene alguna consulta, contacte con la institución.
      
      © 2024 ${instituteName}
    `;

    return { subject, html, text };
  }

  private getAttendanceReportTemplate(
    parentName: string,
    studentName: string,
    attendanceData: any,
    instituteName: string
  ): EmailTemplate {
    const subject = `📅 Reporte de Asistencia - ${studentName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .stats { display: flex; justify-content: space-around; margin: 20px 0; }
          .stat-box { background: white; padding: 15px; text-align: center; border-radius: 8px; flex: 1; margin: 0 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 Reporte de Asistencia</h1>
            <p>${instituteName}</p>
          </div>
          <div class="content">
            <p>Estimado/a <strong>${parentName}</strong>,</p>
            <p>Reporte de asistencia de <strong>${studentName}</strong>:</p>
            
            <div class="stats">
              <div class="stat-box">
                <h3 style="color: #10b981;">${attendanceData?.present ?? 0}</h3>
                <p>Presente</p>
              </div>
              <div class="stat-box">
                <h3 style="color: #f59e0b;">${attendanceData?.late ?? 0}</h3>
                <p>Tardanza</p>
              </div>
              <div class="stat-box">
                <h3 style="color: #ef4444;">${attendanceData?.absent ?? 0}</h3>
                <p>Ausente</p>
              </div>
            </div>
            
            <p><strong>Porcentaje de asistencia:</strong> ${attendanceData?.attendanceRate ?? 0}%</p>
            <p><strong>Total de días registrados:</strong> ${attendanceData?.total ?? 0}</p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no responder.</p>
            <p>© 2024 ${instituteName}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Reporte de Asistencia - ${instituteName}
      
      Estimado/a ${parentName},
      
      Reporte de asistencia de ${studentName}:
      
      Presente: ${attendanceData?.present ?? 0},
      Tardanza: ${attendanceData?.late ?? 0},
      Ausente: ${attendanceData?.absent ?? 0}
      
      Porcentaje de asistencia: ${attendanceData?.attendanceRate ?? 0}%
      Total de días registrados: ${attendanceData?.total ?? 0}
      
      © 2024 ${instituteName}
    `;

    return { subject, html, text };
  }

  // Utility para quitar HTML
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Verificar configuración de email
  async verifyConfiguration(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Error en configuración de email:', error);
      return false;
    }
  }
}
