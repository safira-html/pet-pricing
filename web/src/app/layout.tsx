import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { ProvedorPricing } from "@/lib/store";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Pet Pricing · Copiloto de precificação",
  description: "Protótipo acadêmico do ITA Challenge Sprint (Grupo 12) para o desafio de precificação da Popular Pet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ProvedorPricing>{children}</ProvedorPricing>
      </body>
    </html>
  );
}
