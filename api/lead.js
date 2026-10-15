// Receives lead form submissions and emails them to the sales inbox via Resend.
// Required environment variables (set in Vercel project settings):
//   RESEND_API_KEY   API key from Resend
//   LEAD_TO_EMAIL    where leads are sent, e.g. sales@printleaf.com
//   LEAD_FROM_EMAIL  verified sender on a Resend-approved domain, e.g. "Printleaf <leads@printleaf.com>"
const Busboy = require("busboy");

const MAX_LOGO_BYTES = 4 * 1024 * 1024; // Vercel caps function request bodies at about 4.5 MB
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REQUIRED = {
  "company-stores-business": ["firstName", "lastName", "email", "company", "title", "companySize", "interest"],
  "company-stores-schools": ["firstName", "lastName", "email", "school", "role", "orgType"],
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let logo = null;
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 50 },
    });

    bb.on("field", (name, value) => {
      // Checkboxes repeat the same name, so collect them as a list
      if (name in fields) {
        fields[name] = [].concat(fields[name], value);
      } else {
        fields[name] = value;
      }
    });

    bb.on("file", (name, stream, info) => {
      if (name !== "logo") {
        stream.resume();
        return;
      }
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("limit", () => {
        logo = { tooLarge: true };
      });
      stream.on("end", () => {
        if (logo && logo.tooLarge) return;
        logo = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, logo }));
    req.pipe(bb);
  });
}

const isPng = (buf) => buf.length >= 8 && PNG_SIGNATURE.every((b, i) => buf[i] === b);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function buildEmail(fields, source) {
  const rows = Object.entries(fields)
    .filter(([k]) => !["source", "website", "submittedAt", "pageUrl"].includes(k))
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml([].concat(v).join(", "))}</td></tr>`)
    .join("");
  return `<h2>New ${source === "company-stores-schools" ? "school" : "business"} store request</h2>
<table>${rows}</table>
<p>Source page: ${escapeHtml(fields.pageUrl || "")}<br>Submitted: ${escapeHtml(fields.submittedAt || "")}</p>
<p>The logo is attached.</p>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let parsed;
  try {
    parsed = await parseForm(req);
  } catch (err) {
    return res.status(400).json({ error: "Could not read the form. Please try again." });
  }
  const { fields, logo } = parsed;

  // Honeypot: real people never fill this in, so pretend it worked
  if (fields.website) return res.status(200).json({ ok: true });

  const source = fields.source;
  if (!REQUIRED[source]) return res.status(400).json({ error: "Unknown form." });

  const missing = REQUIRED[source].filter((k) => !fields[k] || (Array.isArray(fields[k]) && fields[k].length === 0));
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(", ")}` });
  if (!EMAIL_RE.test(fields.email)) return res.status(400).json({ error: "Please enter a valid email address." });

  if (!logo || logo.tooLarge) return res.status(400).json({ error: "Logo must be a PNG file up to 4 MB." });
  if (!isPng(logo.buffer)) return res.status(400).json({ error: "This file isn't a valid PNG." });

  const { RESEND_API_KEY, LEAD_TO_EMAIL, LEAD_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !LEAD_TO_EMAIL || !LEAD_FROM_EMAIL) {
    console.error("Lead form: missing RESEND_API_KEY, LEAD_TO_EMAIL or LEAD_FROM_EMAIL");
    return res.status(500).json({ error: "The form isn't set up yet. Please try again later." });
  }

  const orgName = fields.company || fields.school;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: LEAD_FROM_EMAIL,
        to: [LEAD_TO_EMAIL],
        reply_to: fields.email,
        subject: `New store request: ${orgName} (${source === "company-stores-schools" ? "school" : "business"})`,
        html: buildEmail(fields, source),
        attachments: [{ filename: logo.filename || "logo.png", content: logo.buffer.toString("base64") }],
      }),
    });
    if (!r.ok) {
      console.error("Resend error", r.status, await r.text());
      return res.status(502).json({ error: "Could not send your request. Please try again." });
    }
  } catch (err) {
    console.error("Resend request failed", err);
    return res.status(502).json({ error: "Could not send your request. Please try again." });
  }

  return res.status(200).json({ ok: true });
};
