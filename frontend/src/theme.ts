import { Platform } from "react-native";

export const colors = {
  surface: "#0E1420",
  onSurface: "#EAECEF",
  surfaceSecondary: "#182231",
  surfaceTertiary: "#232F42",
  surfaceInverse: "#EAECEF",
  onSurfaceInverse: "#0A192F",
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
  border: "#2C3849",
  borderStrong: "#3E4C5F",
  divider: "#232F42",
  muted: "#9AA5B4",
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

// Soft, Linear/Stripe-style elevation (boxShadow on web/RN 0.81, native shadow elsewhere).
export const shadows = {
  card: Platform.select({
    web: { boxShadow: "0px 4px 18px rgba(10,25,47,0.05), 0px 1px 3px rgba(10,25,47,0.03)" } as any,
    default: { shadowColor: "#0A192F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  }),
  floating: Platform.select({
    web: { boxShadow: "0px 8px 28px rgba(10,25,47,0.10)" } as any,
    default: { shadowColor: "#0A192F", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 22, elevation: 8 },
  }),
};

// Standardized icon sizing — keep these consistent everywhere.
export const iconSizes = { inline: 16, nav: 24, hero: 24, empty: 44 };

export const QUALIFICATIONS = [
  "Background Checked",
  "Insured",
  "Deep Clean Certified",
  "Airbnb Turnover",
  "Eco-Friendly Products",
  "Pet Friendly",
  "5+ Years Experience",
];

export const CORE_PROMISE = "One flat monthly price. Unlimited users. Every feature included. No hidden fees. No per-user charges. Cancel anytime.";
export const BETA_NOTE = "🚀 Founding Partner: the first 10 companies lock in $29.99/mo for life — just $10 your first month.";

export const SUBSCRIPTION_TIERS = [
  {
    id: "founding",
    name: "Founding Partner",
    price: "$10",
    period: "first month",
    tagline: "First 10 companies only",
    steps: ["$10 your first month", "Then $29.99/mo — locked in for life"],
    features: ["Unlimited users", "Every feature included", "Locked-in founder rate forever", "Cancel anytime"],
    accent: "#D4AF37",
    popular: true,
    limited: true,
  },
  {
    id: "professional",
    name: "Professional",
    price: "$10",
    period: "first month",
    tagline: "Scales with your business",
    steps: ["$10 your first month", "$29.99/mo · months 2–4", "$99/mo from month 5"],
    features: ["Unlimited users", "Every feature included", "Renewal reminder emails", "Cancel anytime"],
    accent: "#1A5F7A",
    popular: false,
    limited: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$189",
    period: "/mo",
    tagline: "Unlimited everything",
    steps: ["$189/mo flat — no contracts"],
    features: ["Unlimited users", "Unlimited locations", "Every feature included", "Priority support", "No contracts · no hidden fees", "No per-user pricing"],
    accent: "#2B7043",
    popular: false,
    limited: false,
  },
];

