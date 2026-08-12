const rawAdminEmails = process.env.ADMIN_EMAILS || "srikarkandukuri07@gmail.com,vkalladi@gmail.com";
const singleAdminEmail = process.env.ADMIN_EMAIL;
const rawDevEmails = process.env.DEVELOPER_EMAILS || "kandukurisrikar10@gmail.com";

const adminSet = new Set(
  rawAdminEmails.split(",").map((e) => e.trim().toLowerCase())
);
if (singleAdminEmail) {
  adminSet.add(singleAdminEmail.trim().toLowerCase());
}

export const ADMIN_EMAILS = Array.from(adminSet).filter(Boolean);

export const DEVELOPER_EMAILS = rawDevEmails
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEVELOPER_EMAILS.includes(email.trim().toLowerCase());
}


