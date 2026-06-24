"use client";

import React from 'react';
import { LayoutDashboard } from 'lucide-react';

const Index = () => {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
          <LayoutDashboard size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Panoramica KPI e Contabilità Ore Infragruppo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Placeholder per i futuri KPI */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-32 flex items-center justify-center text-slate-400 italic">
          In attesa di dati dal database...
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-32 flex items-center justify-center text-slate-400 italic">
          In attesa di dati dal database...
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-32 flex items-center justify-center text-slate-400 italic">
          In attesa di dati dal database...
        </div>
      </div>
    </div>
  );
};

export default Index;