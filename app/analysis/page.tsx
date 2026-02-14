"use client"

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend)

interface Trade {
  ticket: number
  profit: number | null
  open_time?: string
}

function computeStats(trades: Trade[]) {
  const total = trades.length
  const profits = trades.map(t => t.profit || 0)
  const sum = profits.reduce((s, v) => s + v, 0)
  const avg = total ? sum / total : 0
  const wins = profits.filter(p => p >= 0).length
  const winRate = total ? (wins / total) * 100 : 0
  return { total, sum, avg, winRate }
}

function makeHistogram(profits: number[], bins = 10) {
  if (profits.length === 0) return { labels: [], counts: [] }
  const min = Math.min(...profits)
  const max = Math.max(...profits)
  const range = max - min || 1
  const binWidth = range / bins
  const counts = new Array(bins).fill(0)
  const labels = new Array(bins).fill(0).map((_, i) => {
    const a = min + i * binWidth
    const b = a + binWidth
    return `${a.toFixed(2)}–${b.toFixed(2)}`
  })
  profits.forEach(p => {
    const idx = Math.min(bins - 1, Math.floor((p - min) / binWidth))
    counts[idx]++
  })
  return { labels, counts }
}

export default function AnalysisPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [bins, setBins] = useState<number>(12)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY
  const supabase = useMemo(() => {
    if (supabaseUrl && supabaseKey) return createClient(supabaseUrl, supabaseKey)
    return null
  }, [supabaseUrl, supabaseKey]) as ReturnType<typeof createClient> | null

  const fetchTrades = async (from?: string, to?: string) => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    let q: any = supabase!.from('trades').select('ticket,profit,open_time').order('open_time', { ascending: true })
    if (from) q = q.gte('open_time', from)
    if (to) q = q.lte('open_time', to)
    const { data } = await q
    if (data) setTrades(data as Trade[])
    setLoading(false)
  }

  useEffect(() => {
    // initial load
    fetchTrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const stats = useMemo(() => computeStats(trades), [trades])

  const profits = trades.map(t => t.profit || 0)
  const histogram = useMemo(() => makeHistogram(profits, bins), [profits, bins])

  // time series: cumulative profit over sorted open_time
  const timeseries = useMemo(() => {
    const sorted = [...trades].filter(t => t.open_time).sort((a, b) => new Date(a.open_time!).getTime() - new Date(b.open_time!).getTime())
    const fullLabels = sorted.map(s => new Date(s.open_time!).toLocaleString())
    const shortLabels = sorted.map(s => {
      const dt = new Date(s.open_time!)
      const dd = String(dt.getDate()).padStart(2, '0')
      const mm = String(dt.getMonth() + 1).padStart(2, '0')
      return `${dd}/${mm}`
    })
    const cum: number[] = []
    let acc = 0
    for (const s of sorted) {
      acc += s.profit || 0
      cum.push(acc)
    }
    return { fullLabels, shortLabels, cum }
  }, [trades])

  const histData = {
    labels: histogram.labels,
    datasets: [
      {
        label: 'Trades',
        data: histogram.counts,
        backgroundColor: 'rgba(99,102,241,0.8)',
      },
    ],
  }

  const lineData = {
    labels: timeseries.shortLabels,
    datasets: [
      {
        label: 'Cumulative Profit',
        data: timeseries.cum,
        borderColor: 'rgba(34,197,94,1)',
        backgroundColor: 'rgba(34,197,94,0.2)',
        tension: 0.2,
        pointRadius: 3,
      },
    ],
  }

  const currencyFormatter = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }), [])

  const histOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y ?? ctx.parsed}`
        }
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (val: any) => `${val}`
        }
      }
    }
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          title: (items: any) => {
            if (!items || items.length === 0) return ''
            const idx = items[0].dataIndex
            return timeseries.fullLabels?.[idx] ?? ''
          },
          label: (ctx: any) => {
            const v = ctx.parsed.y ?? ctx.parsed
            const sign = v > 0 ? '+' : ''
            return `${ctx.dataset.label}: ${sign}${currencyFormatter.format(v)}`
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          autoSkip: true,
          maxTicksLimit: 8,
          maxRotation: 45,
          minRotation: 30,
          callback: (val: any) => {
            const label = String(val)
            return label.length > 12 ? label.slice(0, 12) + '…' : label
          }
        }
      },
      y: {
        ticks: {
          callback: (v: any) => currencyFormatter.format(Number(v))
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1724] text-gray-200 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h1 className="text-2xl font-bold">Analysis</h1>
              <p className="text-sm text-gray-400">Visualize profit distribution and cumulative performance over time.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400">From</label>
              <input value={fromDate} onChange={e => setFromDate(e.target.value)} type="date" className="bg-gray-900 border border-gray-700 text-sm rounded px-2 py-1" />
              <label className="text-xs text-gray-400">To</label>
              <input value={toDate} onChange={e => setToDate(e.target.value)} type="date" className="bg-gray-900 border border-gray-700 text-sm rounded px-2 py-1" />
              <select value={bins} onChange={e => setBins(Number(e.target.value))} className="bg-gray-900 border border-gray-700 text-sm rounded px-2 py-1">
                <option value={6}>6 bins</option>
                <option value={8}>8 bins</option>
                <option value={10}>10 bins</option>
                <option value={12}>12 bins</option>
                <option value={16}>16 bins</option>
                <option value={20}>20 bins</option>
              </select>
              <button onClick={() => fetchTrades(fromDate || undefined, toDate || undefined)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded ml-2 text-sm">Refresh</button>
              <Link href="/" className="bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 hover:bg-gray-700 text-sm">Back</Link>
            </div>
          </div>

          {!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_KEY ? (
            <div className="p-4 bg-yellow-900/40 border border-yellow-700 rounded">Supabase env missing — add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY to .env.local to enable analysis.</div>
          ) : loading ? (
            <div className="p-6 text-gray-300">Loading trades…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-800">
                  <div className="text-xs text-gray-400">Total Trades</div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </div>
                <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-800">
                  <div className="text-xs text-gray-400">Net Profit</div>
                  <div className={`text-2xl font-bold ${stats.sum >= 0 ? 'text-green-400' : 'text-red-400'}`}>{currencyFormatter.format(stats.sum)}</div>
                </div>
                <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-800">
                  <div className="text-xs text-gray-400">Avg Profit / Trade</div>
                  <div className="text-2xl font-bold">{currencyFormatter.format(stats.avg)}</div>
                </div>
                <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-800">
                  <div className="text-xs text-gray-400">Win Rate</div>
                  <div className="text-2xl font-bold">{stats.winRate.toFixed(1)}%</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gradient-to-b from-gray-900/80 to-gray-900/60 p-4 rounded-xl border border-gray-800 shadow-md">
                  <h3 className="text-sm text-gray-300 mb-3">Profit Distribution (histogram)</h3>
                  <div className="h-72">
                    <Bar data={histData} options={histOptions} />
                  </div>
                </div>

                <div className="bg-gradient-to-b from-gray-900/80 to-gray-900/60 p-4 rounded-xl border border-gray-800 shadow-md">
                  <h3 className="text-sm text-gray-300 mb-3">Cumulative Profit Over Time</h3>
                  <div className="h-72">
                    <Line data={lineData} options={lineOptions} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
