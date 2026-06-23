export const colors = {
  surface: "#F8F7F4",
  onSurface: "#0A192F",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#EAE7DF",
  surfaceInverse: "#0A192F",
  onSurfaceInverse: "#F8F7F4",
  brand: "#1A5F7A",
  onBrand: "#FFFFFF",
  gold: "#D4AF37",
  onGold: "#0A192F",
  sage: "#C1D7C2",
  onSage: "#0A192F",
  sageDeep: "#2B7043",
  success: "#2B7043",
  warning: "#D4AF37",
  error: "#D64045",
  border: "#D5D0C4",
  borderStrong: "#A39E93",
  divider: "#EAE7DF",
  muted: "#6B7280",
};

export const statusColors = {
  pending: "#D64045",     // red
  in_progress: "#D4AF37", // yellow/gold
  completed: "#2B7043",   // green
  cancelled: "#A39E93",   // greige/muted
};

export const statusLabels = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const QUALIFICATIONS = [
  "Background Checked",
  "Insured",
  "Deep Clean Certified",
  "Airbnb Turnover",
  "Eco-Friendly Products",
  "Pet Friendly",
  "5+ Years Experience",
];

export const SUBSCRIPTION_TIERS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Get started",
    features: ["Browse & apply to jobs", "Up to 3 active jobs", "1:1 chat", "Ad-supported"],
    accent: "#A39E93",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    period: "/month",
    tagline: "For active cleaners",
    features: ["Everything in Free", "Unlimited jobs", "No ads", "Auto-accept jobs", "Priority in applicant lists"],
    accent: "#1A5F7A",
  },
  {
    id: "business",
    name: "Business",
    price: "$49",
    period: "/month",
    tagline: "For companies",
    features: ["Everything in Pro", "Team management", "Live ops map", "Bid on large jobs", "Priority support"],
    accent: "#D4AF37",
  },
];

