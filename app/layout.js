import "./globals.css";

export const metadata = {
  title: "PetBot Telemedicine Dashboard",
  description: "WhatsApp Cloud API telemedicine support dashboard for veterinary clinics"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
