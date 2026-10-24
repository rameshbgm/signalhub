import type { MembershipRole } from "@/lib/postgres/schema";

export type DevelopmentAccount = {
  key: string;
  username: string;
  email: string;
  name: string;
  role: MembershipRole;
  description: string;
  organizationSlug: string;
  organizationName: string;
};

export const DEVELOPMENT_ACCOUNTS: readonly DevelopmentAccount[] = [
  {
    key: "tenant-admin",
    username: "admin",
    email: "mei.lin.tan@singtel.example.test",
    name: "Mei Lin Tan",
    role: "ADMIN",
    description: "Manage service communications and tenant settings",
    organizationSlug: "singtel",
    organizationName: "Singtel",
  },
  {
    key: "tenant-incident-manager",
    username: "incident-manager",
    email: "ravi.menon@singtel.example.test",
    name: "Ravi Menon",
    role: "INCIDENT_MANAGER",
    description: "Coordinate network and customer service incidents",
    organizationSlug: "singtel",
    organizationName: "Singtel",
  },
  {
    key: "tenant-responder",
    username: "responder",
    email: "nur.aisyah.rahman@singtel.example.test",
    name: "Nur Aisyah Rahman",
    role: "RESPONDER",
    description: "Update service status and monitor operational signals",
    organizationSlug: "singtel",
    organizationName: "Singtel",
  },
  {
    key: "tenant-viewer",
    username: "viewer",
    email: "daniel.koh@singtel.example.test",
    name: "Daniel Koh",
    role: "VIEWER",
    description: "Review reliability trends and service history",
    organizationSlug: "singtel",
    organizationName: "Singtel",
  },
  ...([
    {
      slug: "dbs-bank", name: "DBS Bank", domain: "dbs", people: [
        ["admin", "dbs-admin", "Grace Lim", "grace.lim", "ADMIN", "Manage digital banking status and team access"],
        ["incident-manager", "dbs-incidents", "Marcus Goh", "marcus.goh", "INCIDENT_MANAGER", "Coordinate mobile banking and payments incidents"],
        ["responder", "dbs-responder", "Cheryl Wong", "cheryl.wong", "RESPONDER", "Post incident updates and maintain service components"],
        ["viewer", "dbs-viewer", "Ethan Lee", "ethan.lee", "VIEWER", "Review service health and availability analytics"],
      ],
    },
    {
      slug: "grab", name: "Grab", domain: "grab", people: [
        ["admin", "grab-admin", "Siti Hajar Ismail", "siti.hajar.ismail", "ADMIN", "Manage regional platform status and user access"],
        ["incident-manager", "grab-incidents", "Adrian Chua", "adrian.chua", "INCIDENT_MANAGER", "Coordinate marketplace and mobility incidents"],
        ["responder", "grab-responder", "Priya Nair", "priya.nair", "RESPONDER", "Update customer-facing service status"],
        ["viewer", "grab-viewer", "Kevin Tan", "kevin.tan", "VIEWER", "Review reliability analytics across services"],
      ],
    },
    {
      slug: "shopee", name: "Shopee", domain: "shopee", people: [
        ["admin", "shp-admin", "Jia Wei Ng", "jia.wei.ng", "ADMIN", "Manage commerce status and organization settings"],
        ["incident-manager", "shp-incidents", "Farah Abdullah", "farah.abdullah", "INCIDENT_MANAGER", "Coordinate checkout, seller, and logistics incidents"],
        ["responder", "shp-responder", "Benjamin Ho", "benjamin.ho", "RESPONDER", "Post operational updates and manage monitors"],
        ["viewer", "shp-viewer", "Rachel Teo", "rachel.teo", "VIEWER", "Review service analytics and incident history"],
      ],
    },
    {
      slug: "govtech", name: "GovTech Singapore", domain: "govtech", people: [
        ["admin", "gov-admin", "Esther Yeo", "esther.yeo", "ADMIN", "Manage digital government service communications"],
        ["incident-manager", "gov-incidents", "Arun Kumar", "arun.kumar", "INCIDENT_MANAGER", "Coordinate citizen-service incidents and updates"],
        ["responder", "gov-responder", "Hui Min Ong", "hui.min.ong", "RESPONDER", "Maintain service components and operational updates"],
        ["viewer", "gov-viewer", "Samuel Lim", "samuel.lim", "VIEWER", "Review public service availability analytics"],
      ],
    },
  ] as const).flatMap((organization) => organization.people.map(([roleKey, username, name, emailName, role, description]) => ({
    key: `${organization.slug}-${roleKey}`,
    username,
    email: `${emailName}@${organization.domain}.example.test`,
    name,
    role: role as MembershipRole,
    description,
    organizationSlug: organization.slug,
    organizationName: organization.name,
  }))),
] as const;

export function developmentQuickLoginAllowed(input: {
  nodeEnv?: string;
  enabled?: string;
  hostname: string;
}) {
  return (
    input.nodeEnv !== "production" &&
    input.enabled === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(input.hostname)
  );
}
