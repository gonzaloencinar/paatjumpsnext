import { Geist } from "next/font/google";

// Shared by both root layouts — (store)/[locale] and admin — so the font
// pipeline stays identical across route groups.
export const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
