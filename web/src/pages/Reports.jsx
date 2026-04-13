import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export default function Reports() {
  const { addToast } = useStore();
  const [summary, setSummary] = useState([]);
  const [costCenterData, setCostCenterData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      try {
        const [monthlyRes, ccRes] = await Promise.all([
          api.get(`/reports/monthly?year=${year}`).catch(() => ({ data: [] })),
          api.get('/reports/cost-centers').catch(() => ({ data: [] })),
        ]);
        setSummary(monthlyRes.data || []);
        setCostCenterData(ccRes.data || []);
      } catch (e) {
        addToast('Failed to load reports', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchReports();
  }, [year]);

  const exportCSV = async () => {
    try {
      const res = await api.get(`/reports/export?year=${year}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `foxtrot-report-${year}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      addToast('Export failed', 'error');
    }
  };

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 0,
    },
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            className="input-field"
            style={{ marginBottom: 0, width: 100 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[2023, 2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 240 }} />)}
        </div>
      ) : (
        <>
          {/* Monthly summary */}
          <div className="card" style={{ marginBottom: 32 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20 }}>
              Monthly Spend — {year}
            </div>
            {summary.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={summary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="spend" fill="var(--accent)" name="Spend" />
                  <Bar dataKey="topups" fill="var(--success)" name="Top Ups" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>No data for {year}</div>
            )}
          </div>

          {/* Cost center comparison */}
          <div className="card">
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20 }}>
              Cost Center Comparison
            </div>
            {costCenterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={costCenterData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={120} />
                  <Tooltip {...tooltipStyle} formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="spend" fill="var(--accent)" name="Total Spend" />
                  <Bar dataKey="balance" fill="var(--success)" name="Balance" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>No cost center data</div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
