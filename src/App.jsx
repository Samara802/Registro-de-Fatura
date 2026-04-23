import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Trash2, X, Edit3, Wallet, LogOut, Moon, Sun, Landmark, FileText, CreditCard, PiggyBank, Filter, AlertCircle, RefreshCcw } from 'lucide-react';

// --- CONFIGURAÇÃO FIREBASE ---
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, setDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBqjSIiy8nMhVdhUtVxN1Ykkm8OmZzAa-Q",
  authDomain: "gerenciador-523bf.firebaseapp.com",
  projectId: "gerenciador-523bf",
  storageBucket: "gerenciador-523bf.firebasestorage.app",
  messagingSenderId: "627593799117",
  appId: "1:627593799117:web:c88474f6d2bc6f1fddd084"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const getCategoria = (nome, darkMode) => {
  const n = nome.toLowerCase();
  if (n.includes('banco do brasil') || n.includes('bb')) 
      return { label: 'BANCO', icon: <Landmark size={18} />, color: 'bg-yellow-500/10 text-yellow-500 border-transparent', banco: 'BB' };
  if (n.includes('c6')) 
      return { label: 'BANCO', icon: <CreditCard size={18} />, color: darkMode ? 'bg-white/5 text-white border-transparent' : 'bg-gray-900 text-white border-transparent', banco: 'C6' };
  if (n.includes('nubank') || n.includes('fatura')) 
      return { label: 'FINANCEIRO', icon: <PiggyBank size={18} />, color: 'bg-purple-500/10 text-purple-400 border-transparent', banco: n.includes('nubank') ? 'Nubank' : null };
  return { label: 'GERAL', icon: <FileText size={18} />, color: 'bg-gray-500/10 text-gray-400 border-transparent' };
};

const SpreadsheetApp = () => {
  const [user, setUser] = useState(null);
  const [data, setData] = useState([]);
  const [saldoEmConta, setSaldoEmConta] = useState(0); 
  const [filtroStatus, setFiltroStatus] = useState("Pendentes");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ nome: '', valor: '', status: 'Pendente', data: '', recorrente: false });
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const q = query(collection(db, "registros"), where("userId", "==", currentUser.uid));
        const unsubscribeData = onSnapshot(q, (snapshot) => {
          setData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const docRef = doc(db, "saldos_usuarios", currentUser.uid);
        getDoc(docRef).then((docSnap) => {
          if (docSnap.exists()) setSaldoEmConta(docSnap.data().saldo || 0);
        });
        return () => unsubscribeData();
      } else {
        setUser(null);
        setData([]);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const handleStatusChange = async (item, novoStatus) => {
    await updateDoc(doc(db, "registros", item.id), { status: novoStatus });
    if (novoStatus === 'Confirmada' && item.recorrente && item.data) {
      const dataAtual = new Date(item.data + "T12:00:00");
      dataAtual.setMonth(dataAtual.getMonth() + 1);
      const novaDataStr = dataAtual.toISOString().split('T')[0];
      const jaExiste = data.find(d => d.nome === item.nome && d.data === novaDataStr);
      if (!jaExiste) {
        await addDoc(collection(db, "registros"), {
          nome: item.nome, valor: item.valor, status: 'Pendente', data: novaDataStr, recorrente: true, userId: user.uid
        });
      }
    }
  };

  const verificarVencido = (dataVencimento, status) => {
    if (!dataVencimento || status === 'Confirmada') return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dataVencimento + "T12:00:00");
    vencimento.setHours(0, 0, 0, 0);
    return vencimento < hoje;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorNum = parseFloat(formData.valor) || 0;
    if (editingId) await updateDoc(doc(db, "registros", editingId), { ...formData, valor: valorNum });
    else await addDoc(collection(db, "registros"), { ...formData, valor: valorNum, userId: user.uid });
    closeModal();
  };

  const closeModal = () => { 
    setIsModalOpen(false); setEditingId(null); 
    setFormData({ nome: '', valor: '', status: 'Pendente', data: '', recorrente: false }); 
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
      let matchesStatus = true;
      if (filtroStatus === "Pendentes") matchesStatus = item.status !== "Confirmada";
      else if (filtroStatus === "Pagos") matchesStatus = item.status === "Confirmada";
      return matchesSearch && matchesStatus;
    });
  }, [data, searchTerm, filtroStatus]);

  const totalPendente = useMemo(() => data.filter(item => item.status !== 'Confirmada').reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0), [data]);
  const totalPago = useMemo(() => data.filter(item => item.status === 'Confirmada').reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0), [data]);
  const saldoFinalPositivo = useMemo(() => saldoEmConta - totalPendente, [totalPendente, saldoEmConta]);

  const totalSelecionado = useMemo(() => {
    return data.filter(item => selectedIds.includes(item.id)).reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
  }, [data, selectedIds]);

  const statusSobra = useMemo(() => {
    if (saldoFinalPositivo > 0) return { cor: 'from-[#5643ff] to-[#8b5cf6]', neon: 'shadow-[0_0_20px_rgba(86,67,255,0.3)]', msg: 'Sobrando' };
    return { cor: 'from-red-500 to-rose-700', neon: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]', msg: 'Falta p/ pagar' };
  }, [saldoFinalPositivo]);

  if (!user) return <div className="min-h-screen bg-[#020617]" />;

  return (
    <div className={`min-h-screen p-4 md:p-10 transition-all duration-700 ${darkMode ? 'bg-[#020617] text-gray-100' : 'bg-[#f8f9ff] text-gray-900'}`}>
      
      {/* HEADER AJUSTADO */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
        <h1 className="text-4xl font-black tracking-tighter flex items-center gap-4 text-left w-full">
          <span className="bg-gradient-to-r from-[#5643ff] to-fuchsia-500 bg-clip-text text-transparent italic">Gerenciador</span>
          <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
            {darkMode ? <Sun size={20} className="text-yellow-400"/> : <Moon size={20}/>}
          </button>
        </h1>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={() => setIsModalOpen(true)} className="flex-1 md:flex-none bg-[#5643ff] text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:scale-95 transition-all">
            <Plus size={18} className="inline mr-2" /> Novo Registro
          </button>
          <button onClick={() => signOut(auth)} className="p-4 rounded-2xl border border-white/5 hover:bg-red-500/10 transition-all"><LogOut size={20} /></button>
        </div>
      </div>

      {/* CARDS BALANCEADOS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className={`p-8 rounded-[40px] border transition-all ${darkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="text-indigo-400 font-black uppercase text-[10px] mb-3 tracking-widest">Saldo Atual</div>
          <div className="flex items-center"><span className="text-2xl font-black text-emerald-500 mr-2">R$</span><input type="number" step="0.01" className="bg-transparent text-4xl font-black outline-none w-full text-emerald-500" value={saldoEmConta} onChange={(e) => setSaldoEmConta(e.target.value)} /></div>
        </div>
        <div className={`p-8 rounded-[40px] border transition-all ${darkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="text-red-500 font-black uppercase text-[10px] mb-3 tracking-widest">Pendente</div>
          <h3 className="text-4xl font-black text-red-500 text-left tracking-tighter">R$ {totalPendente.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>
        <div className={`p-8 rounded-[40px] border transition-all ${darkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="text-emerald-500 font-black uppercase text-[10px] mb-3 tracking-widest">Pago</div>
          <h3 className="text-4xl font-black text-emerald-500 text-left tracking-tighter">R$ {totalPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>
        <div className={`p-8 rounded-[40px] shadow-xl bg-gradient-to-br ${statusSobra.cor} ${statusSobra.neon} text-white transition-all`}>
          <p className="text-white/70 text-[10px] font-black uppercase mb-3 tracking-widest text-left">Sobra Final</p>
          <h3 className="text-4xl font-black tracking-tighter text-left">R$ {Math.abs(saldoFinalPositivo).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>
      </div>

      {/* TABELA REFINADA */}
      <div className={`max-w-7xl mx-auto rounded-[45px] shadow-2xl border ${darkMode ? 'bg-gray-900/40 border-white/5' : 'bg-white border-gray-50'}`}>
        <div className="p-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
            <div className={`flex items-center gap-4 px-6 py-4 w-full max-w-lg rounded-2xl ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
              <Search className="text-gray-400" size={20} />
              <input type="text" placeholder="Pesquisar..." className="bg-transparent outline-none w-full text-base font-bold" onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className={`flex p-1.5 rounded-2xl ${darkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
              {["Pendentes", "Pagos", "Todos"].map((aba) => (
                <button key={aba} onClick={() => setFiltroStatus(aba)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroStatus === aba ? 'bg-[#5643ff] text-white shadow-md' : 'text-gray-500'}`}>{aba}</button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto pb-6">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/[0.02]">
                  <th className="px-6 py-6 text-center">SEL.</th>
                  <th className="px-8 py-6 text-left">Vencimento</th>
                  <th className="px-8 py-6 text-left">Descrição</th>
                  <th className="px-8 py-6 text-left">Valor</th>
                  <th className="px-8 py-6 text-left">Status</th>
                  <th className="px-8 py-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm font-bold">
                {filteredData.map((item) => {
                  const cat = getCategoria(item.nome, darkMode);
                  const vencido = verificarVencido(item.data, item.status);
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr key={item.id} className={`transition-all duration-300 border-b border-white/[0.02] ${isSelected ? 'bg-[#5643ff]/10' : vencido ? 'bg-red-500/[0.03]' : ''} hover:bg-white/[0.02]`}>
                      <td className="px-6 py-6 text-center">
                        <button onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])} 
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center mx-auto transition-all ${isSelected ? 'bg-[#5643ff] border-[#5643ff]' : 'border-gray-600'}`}>
                          {isSelected && <X size={14} className="text-white" strokeWidth={4} />}
                        </button>
                      </td>
                      <td className="px-8 py-6 text-left">
                        <div className="flex flex-col">
                          <span className={vencido ? "text-red-500 font-black underline" : "text-gray-400"}>
                            {item.data ? new Date(item.data + "T12:00:00").toLocaleDateString('pt-BR') : "--/--"}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-left">
                        <div className="flex items-center gap-4">
                          <span className={`p-2.5 rounded-xl ${cat.color}`}>{cat.icon}</span>
                          <div className="flex flex-col">
                            <span className="text-base tracking-tight">{item.nome}</span>
                            {item.recorrente && <span className="text-[9px] text-indigo-400 flex items-center gap-1 uppercase font-black tracking-tighter"><RefreshCcw size={8}/> Fixa</span>}
                          </div>
                        </div>
                      </td>
                      <td className={`px-8 py-6 text-xl tracking-tighter text-left ${item.status === 'Confirmada' ? 'text-emerald-500' : vencido ? 'text-red-500' : 'text-red-400'}`}>
                        R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                      </td>
                      <td className="px-8 py-6 text-left">
                        <select className={`px-4 py-2 rounded-full text-[10px] font-black uppercase outline-none ${item.status === 'Confirmada' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`} 
                          value={item.status} onChange={(e) => handleStatusChange(item, e.target.value)}>
                          <option value="Pendente">Pendente</option>
                          <option value="Confirmada">Pago</option>
                        </select>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-5 opacity-40 hover:opacity-100 transition-all">
                          <button onClick={() => { setEditingId(item.id); setFormData({...item}); setIsModalOpen(true); }} className="hover:text-indigo-500"><Edit3 size={18}/></button>
                          <button onClick={async () => { if(window.confirm("Excluir?")) await deleteDoc(doc(db, "registros", item.id)) }} className="hover:text-red-500"><Trash2 size={18}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TOTALIZADOR */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-gray-900 border border-[#5643ff]/50 px-10 py-5 rounded-[30px] shadow-2xl flex items-center gap-8 backdrop-blur-xl">
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest italic text-left">Soma Selecionada ({selectedIds.length})</span>
              <span className="text-2xl font-black text-white tracking-tighter">R$ {totalSelecionado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <button onClick={() => setSelectedIds([])} className="text-gray-500 hover:text-white transition-all"><X size={20}/></button>
          </div>
        </div>
      )}

      {/* MODAL AJUSTADO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-[60]">
          <div className={`w-full max-w-xl rounded-[50px] p-12 border ${darkMode ? 'bg-gray-900 border-white/10 text-white' : 'bg-white border-transparent text-gray-900'}`}>
            <div className="flex justify-between items-center mb-8"><h2 className="text-3xl font-black italic tracking-tighter text-left">Novo Registro</h2><button onClick={closeModal}><X size={24} /></button></div>
            <form onSubmit={handleSubmit} className="space-y-8">
              <input required className={`w-full p-5 rounded-2xl outline-none font-bold text-lg ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} placeholder="Descrição" />
              <div className="grid grid-cols-2 gap-6">
                <input required type="number" step="0.01" className={`w-full p-5 rounded-2xl outline-none font-bold text-lg ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.valor} onChange={(e) => setFormData({...formData, valor: e.target.value})} placeholder="Valor R$" />
                <input type="date" className={`w-full p-5 rounded-2xl outline-none font-bold text-lg ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.data} onChange={(e) => setFormData({...formData, data: e.target.value})} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer group text-left">
                <div onClick={() => setFormData({...formData, recorrente: !formData.recorrente})} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${formData.recorrente ? 'bg-[#5643ff] border-[#5643ff]' : 'border-gray-600'}`}>
                  {formData.recorrente && <X size={14} className="text-white" strokeWidth={4} />}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-indigo-400 transition-colors">Conta Fixa (Repetir todo mês)</span>
              </label>
              <button type="submit" className="w-full bg-[#5643ff] text-white py-6 rounded-2xl font-black shadow-lg uppercase tracking-widest text-[11px] active:scale-95 transition-all">SALVAR REGISTRO</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetApp;