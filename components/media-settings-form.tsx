'use client'

import { useActionState, useState } from 'react'
import { AlertCircle, CheckCircle2, Image as ImageIcon, LoaderCircle, RotateCcw, Save } from 'lucide-react'
import { saveImageSettings } from '@/app/admin/actions'
import { normalizeMediaBase, resolveMediaUrl } from '@/lib/media-url'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Alert, AlertDescription } from './ui/alert'

export function MediaSettingsForm({ base, samplePath }: { base: string; samplePath: string | null }) {
  const [value, setValue] = useState(base)
  const [state, action, pending] = useActionState(saveImageSettings, null)
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [testState, setTestState] = useState('')
  function test() {
    const normalized = normalizeMediaBase(value)
    setTestUrl(null)
    if (!normalized) { setTestState('请输入 / 或完整的 http://、https:// 服务器地址。'); return }
    if (!samplePath) { setTestState('目前没有可测试的公开图片，请先上传一张工具图片。'); return }
    if (location.protocol === 'https:' && normalized.startsWith('http:')) { setTestState('当前网站使用 HTTPS，请使用 HTTPS 图片服务器地址。'); return }
    setTestState('正在测试图片访问…')
    setTestUrl(resolveMediaUrl(samplePath, normalized) + '?test=' + Date.now())
  }
  return <form action={action} className="admin-form" aria-busy={pending}>
    <input type="hidden" name="expected" value={base} />
    <fieldset disabled={pending} className="grid min-w-0 gap-6">
      <div className="admin-form-section">
        <div className="admin-form-section-head"><span className="admin-form-section-icon" aria-hidden="true"><ImageIcon size={16} /></span><div><h3>图片服务器地址</h3><p>统一设置正式工具 Logo 和封面的访问位置。</p></div></div>
        <label htmlFor="media-base" className="mb-2 block text-sm font-medium">服务器地址</label>
        <Input id="media-base" name="base" required maxLength={1000} value={value} onChange={e => { setValue(e.target.value); setTestUrl(null); setTestState('') }} placeholder="/ 或 https://img.example.com" aria-describedby="media-base-help" />
        <div id="media-base-help" className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          <p>填写 / 使用当前网站服务器。填写完整 IP 或域名地址，例如 http://192.168.1.10:8080 或 https://img.example.com，使用独立图片服务器。</p>
          <p>切换前请先同步图片，并保持 /media/ 访问路径一致。这个设置只改变读取地址，上传仍保存到当前服务器；私有投稿图片继续通过登录权限接口读取。</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={test}>测试图片访问</Button>
          <Button type="button" variant="outline" onClick={() => { setValue('/'); setTestUrl(null); setTestState('已填写本地地址，点击保存后生效。') }}><RotateCcw aria-hidden="true" />恢复默认</Button>
        </div>
        {testState && <p role="status" className="mt-3 text-sm">{testState}</p>}
        {testUrl && <img key={testUrl} src={testUrl} alt="图片服务器访问测试" className="mt-3 h-24 w-24 rounded-lg border object-contain" onLoad={() => setTestState('图片访问成功。')} onError={() => setTestState('图片访问失败，请检查服务器地址、文件同步情况及 HTTPS 配置。')} />}
      </div>
      {state?.error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{state.error}</AlertDescription></Alert>}
      <div className="admin-form-actions"><Button type="submit" className="min-h-11 px-6">{pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save aria-hidden="true" />}{pending ? '正在保存…' : '保存图片设置'}</Button></div>
    </fieldset>
  </form>
}

export function MediaSettingsSaved() {
  return <div className="admin-notice" role="status"><CheckCircle2 size={16} aria-hidden="true" />图片服务器地址已保存。</div>
}
