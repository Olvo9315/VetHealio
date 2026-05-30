import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "VetHealio <no-reply@vethealio.com>";

export async function sendLeaveRequestEmail(params: {
  adminEmail: string;
  staffName: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: params.adminEmail,
    subject: `Nueva solicitud de baja — ${params.staffName}`,
    html: `
      <h2>Nueva solicitud de baja</h2>
      <p><strong>Empleado:</strong> ${params.staffName}</p>
      <p><strong>Tipo:</strong> ${params.type}</p>
      <p><strong>Desde:</strong> ${params.startDate}</p>
      <p><strong>Hasta:</strong> ${params.endDate}</p>
      ${params.reason ? `<p><strong>Motivo:</strong> ${params.reason}</p>` : ""}
      <p>Accede al panel para aprobar o rechazar la solicitud.</p>
    `,
  });
}

export async function sendLeaveReviewEmail(params: {
  staffEmail: string;
  staffName: string;
  type: string;
  status: "APPROVED" | "REJECTED";
  reviewNote?: string;
}) {
  const approved = params.status === "APPROVED";
  await resend.emails.send({
    from: FROM,
    to: params.staffEmail,
    subject: `Tu solicitud de baja ha sido ${approved ? "aprobada" : "rechazada"}`,
    html: `
      <h2>Solicitud de baja ${approved ? "aprobada ✅" : "rechazada ❌"}</h2>
      <p>Hola ${params.staffName},</p>
      <p>Tu solicitud de tipo <strong>${params.type}</strong> ha sido <strong>${approved ? "aprobada" : "rechazada"}</strong>.</p>
      ${params.reviewNote ? `<p><strong>Comentario del revisor:</strong> ${params.reviewNote}</p>` : ""}
    `,
  });
}

export async function sendCertExpiryEmail(params: {
  adminEmail: string;
  staffName: string;
  certName: string;
  expiryDate: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: params.adminEmail,
    subject: `Certificado próximo a vencer — ${params.staffName}`,
    html: `
      <h2>Certificado por vencer</h2>
      <p><strong>Empleado:</strong> ${params.staffName}</p>
      <p><strong>Certificado:</strong> ${params.certName}</p>
      <p><strong>Vence el:</strong> ${params.expiryDate}</p>
      <p>Recuerda renovar el certificado antes de su fecha de vencimiento.</p>
    `,
  });
}
