import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O selo de desenvolvimento cobria o rodapé do menu nas revisões de tela.
  devIndicators: false,
  // Na Vercel com serviços, o otimizador /_next/image não é roteado; o logo é pequeno e vai direto.
  images: { unoptimized: true },
};

export default nextConfig;
