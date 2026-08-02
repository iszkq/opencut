import Script from "next/script";
import "./globals.css";
import { baseMetaData } from "./metadata";
import { ChineseUi } from "@/components/chinese-ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";

export const metadata = baseMetaData;
// Desktop projects are local and stateful. Rendering routes on demand also
// avoids prebuilding network-backed marketing pages into the packaged editor.
export const dynamic = "force-dynamic";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				{process.env.NODE_ENV === "development" && (
					<>
						<Script
							src="//unpkg.com/react-scan/dist/auto.global.js"
							crossOrigin="anonymous"
							strategy="beforeInteractive"
						/>
					</>
				)}
			</head>
			<body className="font-sans antialiased">
				<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
					<TooltipProvider delayDuration={300}>
						<ChineseUi />
						{children}
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
