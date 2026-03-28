import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'

export default async (req: Request, context: Context) => {
  const store = getStore({ name: 'phone-logs', consistency: 'strong' })

  if (req.method === 'POST') {
    const { phone } = await req.json()

    if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
      return Response.json({ error: 'A valid phone number is required' }, { status: 400 })
    }

    const timestamp = new Date().toISOString()
    const key = `log-${timestamp}-${crypto.randomUUID().slice(0, 8)}`

    await store.setJSON(key, {
      phone: phone.trim(),
      timestamp,
      ip: context.ip,
      city: context.geo?.city || '',
      country: context.geo?.country?.name || '',
    })

    return Response.json({ success: true })
  }

  if (req.method === 'GET') {
    const { blobs } = await store.list({ prefix: 'log-' })

    const entries = []
    for (const blob of blobs) {
      const data = await store.get(blob.key, { type: 'json' }) as Record<string, string> | null
      if (data) {
        entries.push(data)
      }
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    // Check if CSV format requested
    const url = new URL(req.url)
    if (url.searchParams.get('format') === 'csv') {
      const csvHeader = 'Phone,Timestamp,City,Country'
      const csvRows = entries.map(
        (e) => `"${e.phone}","${e.timestamp}","${e.city || ''}","${e.country || ''}"`
      )
      const csv = [csvHeader, ...csvRows].join('\n')

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="phone-logs.csv"',
        },
      })
    }

    return Response.json({ entries, total: entries.length })
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}

export const config: Config = {
  path: '/api/phone-log',
}
