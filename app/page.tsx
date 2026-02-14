'use client'

import { useEffect, useState } from 'react'
import { createClient, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Activity, History, Wallet, Zap } from 'lucide-react'

// Types
interface Trade {
  ticket: number
  symbol: string
  action: string
  open_price: number
  close_price: number | null
  profit: number | null
  open_time: string
  close_time: string | null
  indicators: any
}

interface AccountStats {
  balance: number
  equity: number
}

// Config Supabase (guarded: avoid crash when env vars missing)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY
let supabase = null as ReturnType<typeof createClient> | null
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey)
} else {
  console.warn('Supabase env missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_KEY')
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [account, setAccount] = useState<AccountStats>({ balance: 0, equity: 0 })
  
  // แยกไม้ Active / History
  const activeTrades = trades.filter(t => t.close_time === null)
  const historyTrades = trades.filter(t => t.close_time !== null)

  // คำนวณกำไรเฉพาะไม้ที่ปิดแล้ว
  const totalClosedProfit = historyTrades.reduce((sum, t) => sum + (t.profit || 0), 0)
  const winRate = historyTrades.length > 0 
    ? ((historyTrades.filter(t => (t.profit || 0) >= 0).length / historyTrades.length) * 100).toFixed(1)
    : '0'

  useEffect(() => {
    if (!supabase) return

    fetchData()

    // 1. ฟังการเปลี่ยนแปลงของ Trades
    const tradeChannel = supabase
      .channel('realtime-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        fetchData()
      })
      .subscribe()

    // 2. ฟังการเปลี่ยนแปลงของ Account Stats (Balance/Equity)
    const accountChannel = supabase
      .channel('realtime-account')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_stats' }, (payload: any) => {
        if (payload.new) {
          setAccount({
            balance: payload.new.balance,
            equity: payload.new.equity
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(tradeChannel)
      supabase.removeChannel(accountChannel)
    }
  }, [])

  async function fetchData() {
    // ดึง Trades
    const { data: tradeData } = await supabase
      .from('trades')
      .select('*')
      .order('open_time', { ascending: false })
    
    if (tradeData) setTrades(tradeData as Trade[])

    // ดึง Account Stats ล่าสุด
    const { data: accData } = await supabase
      .from('account_stats')
      .select('*')
      .limit(1)
      .single()
    
    if (accData) {
      setAccount({ balance: accData.balance, equity: accData.equity })
    }
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-200 font-sans pb-24">
      <div className="max-w-6xl mx-auto p-6">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Activity className="text-yellow-500" /> Gold AI Trader
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/analysis" className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-700 flex items-center">
              <span className="text-gray-400">Analysis</span>
            </Link>
             <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
                <span className="text-gray-400">Profit: </span>
                <span className={`font-bold ${totalClosedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${totalClosedProfit.toFixed(2)}
                </span>
             </div>
             <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
                <span className="text-gray-400">Win Rate: </span>
                <span className="font-bold text-blue-400">{winRate}%</span>
             </div>
          </div>
        </div>

        {/* 🟢 Active Positions Section */}
        {activeTrades.length > 0 && (
          <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-green-400">
              <Zap size={18} /> Active Positions ({activeTrades.length})
            </h2>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-lg shadow-green-900/10">
              <table className="w-full text-left">
                <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="p-3">Ticket</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Open Time</th>
                    <th className="p-3 text-right">Open Price</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {activeTrades.map((trade) => (
                    <tr key={trade.ticket} className="bg-gray-800 hover:bg-gray-750 transition">
                      <td className="p-3 font-mono text-sm text-gray-400">#{trade.ticket}</td>
                      <td className="p-3">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            trade.action === 'BUY' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                          }`}>
                            {trade.action === 'BUY' ? <ArrowUp size={12} className="mr-1"/> : <ArrowDown size={12} className="mr-1"/>}
                            {trade.action}
                         </span>
                      </td>
                      <td className="p-3 text-sm text-gray-400">
                        {new Date(trade.open_time).toLocaleTimeString()}
                      </td>
                      <td className="p-3 text-right font-mono text-white">${trade.open_price.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span className="text-yellow-500 text-xs animate-pulse">● Running</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 📜 Trade History Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-400">
            <History size={18} /> Trade History
          </h2>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-900 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="p-3">Ticket</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Time</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {historyTrades.map((trade) => (
                    <tr key={trade.ticket} className="hover:bg-gray-700/50 transition">
                      <td className="p-3 font-mono text-xs text-gray-500">#{trade.ticket}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold ${trade.action === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>
                          {trade.action}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {new Date(trade.open_time).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-sm font-mono text-gray-300">
                        ${trade.open_price.toFixed(2)}
                      </td>
                      <td className={`p-3 text-right text-sm font-bold ${
                        (trade.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {(trade.profit || 0) >= 0 ? '+' : ''}{(trade.profit || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                   {historyTrades.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-500">No history yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* 💰 Sticky Footer (MT5 Style Balance Bar) */}
      <div className="fixed bottom-0 left-0 w-full bg-[#2d2d2d] border-t border-gray-600 p-2 shadow-2xl z-50">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-6 text-xs sm:text-sm font-mono">
            <div className="flex items-center gap-2">
                <span className="text-gray-400">Balance:</span>
                <span className="text-white font-bold text-base">
                    {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-gray-500">USD</span>
                </span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-gray-400">Equity:</span>
                <span className="text-white font-bold text-base">
                    {account.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-gray-400">Free Margin:</span>
                <span className="text-white font-bold text-base">
                    {/* Free Margin คำนวณคร่าวๆ หรือส่งมาเพิ่มก็ได้ อันนี้โชว์เท่า Equity ไปก่อนถ้ายุ่งยาก */}
                    {account.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
            </div>
        </div>
      </div>

    </div>
  )
}