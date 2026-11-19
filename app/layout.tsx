import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/noto-sans-sc'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'AI 工具箱 · AI 工具导航', template: '%s | AI 工具箱' },
  description: '发现适合你的 AI 工具，探索 AI 对话、写作、图像、视频、编程等分类。',
  icons: { icon: '/directory-icon.svg' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f9fc',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="light">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
