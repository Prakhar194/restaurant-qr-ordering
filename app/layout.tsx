import "./globals.css";

export const metadata = {
  title: "TableFlow — QR Restaurant Ordering",
  description: "QR table ordering and restaurant operations dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
