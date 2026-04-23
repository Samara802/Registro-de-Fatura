import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Trash2, X, Edit3, Wallet, LogOut, Moon, Sun, Landmark, FileText, CreditCard, PiggyBank, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';

// --- CONFIGURAÇÃO FIREBASE ---
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, setDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const getCategoria = (nome, darkMode) => {
  const n = nome.toLowerCase();
  if (n.includes('banco do brasil') || n.includes('bb')) 
      return { label: 'BANCO', icon: <Landmark size={18} />, color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', banco: 'BB' };
  if (n.includes('c6')) 
      return { label: 'BANCO', icon: <CreditCard size={18} />, color: darkMode ? 'bg-white/10 text-white border-white/20' : 'bg-gray-900 text-white border-gray-900', banco: 'C6' };
  if (n.includes('nubank') || n.includes('fatura')) 
      return { label: 'FINANCEIRO', icon: <PiggyBank size={18} />, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', banco: n.includes('nubank') ? 'Nubank' : null };
  return { label: 'GERAL', icon: <FileText size={18} />, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
};

const SpreadsheetApp = () => {
  const [user, setUser] = useState(null);
  const [data, setData] = useState([]);
  const [saldoEmConta, setSaldoEmConta] = useState(0); 
  const [filtroStatus, setFiltroStatus] = useState("Pendentes");
  const [filtroBanco, setFiltroBanco] = useState("Todos");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ nome: '', valor: '', status: 'Pendente', data: '' });
  
  // ESTADO PARA OS SELECIONADOS
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

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
  };

  const atualizarSaldoNoBanco = async (valor) => {
    const novoSaldo = parseFloat(valor) || 0;
    setSaldoEmConta(novoSaldo);
    if (user) await setDoc(doc(db, "saldos_usuarios", user.uid), { saldo: novoSaldo }, { merge: true });
  };

  const verificarVencido = (dataVencimento, status) => {
    if (!dataVencimento || status === 'Confirmada') return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dataVencimento + "T12:00:00");
    vencimento.setHours(0, 0, 0, 0);
    return vencimento < hoje;
  };

  // LOGICA DO TOTALIZADOR
  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const totalSelecionado = useMemo(() => {
    return data
      .filter(item => selectedIds.includes(item.id))
      .reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
  }, [data, selectedIds]);

  const totalPendente = useMemo(() => data.filter(item => item.status !== 'Confirmada').reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0), [data]);
  const totalPago = useMemo(() => data.filter(item => item.status === 'Confirmada').reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0), [data]);
  const saldoFinalPositivo = useMemo(() => saldoEmConta - totalPendente, [totalPendente, saldoEmConta]);

  const statusSobra = useMemo(() => {
    if (saldoFinalPositivo > 0) return { cor: 'from-[#5643ff] to-[#8b5cf6]', neon: 'shadow-[#5643ff]/40', msg: 'Sobrando' };
    if (saldoFinalPositivo === 0) return { cor: 'from-amber-500 to-orange-600', neon: 'shadow-orange-500/40', msg: 'No limite' };
    return { cor: 'from-red-500 to-rose-700', neon: 'shadow-red-500/40', msg: 'Falta p/ pagar tudo' };
  }, [saldoFinalPositivo]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const cat = getCategoria(item.nome, darkMode);
      const matchesBanco = filtroBanco === "Todos" || (cat.banco === filtroBanco);
      let matchesStatus = true;
      if (filtroStatus === "Pendentes") matchesStatus = item.status !== "Confirmada";
      else if (filtroStatus === "Pagos") matchesStatus = item.status === "Confirmada";
      return matchesSearch && matchesStatus && matchesBanco;
    });
  }, [data, searchTerm, filtroStatus, filtroBanco, darkMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorNum = parseFloat(formData.valor) || 0;
    if (editingId) await updateDoc(doc(db, "registros", editingId), { ...formData, valor: valorNum });
    else await addDoc(collection(db, "registros"), { ...formData, valor: valorNum, userId: user.uid });
    closeModal();
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); setFormData({ nome: '', valor: '', status: 'Pendente', data: '' }); };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4 font-sans">
      <div className="w-full max-w-md p-10 rounded-[35px] shadow-2xl border bg-gray-900 border-gray-800 text-center">
        <div className="bg-gradient-to-tr from-[#5643ff] to-[#8b5cf6] w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-bounce"><Wallet className="text-white" size={32} /></div>
        <h1 className="text-3xl font-black mb-8 italic text-white tracking-tighter">Gerenciador</h1>
        <button onClick={handleLogin} className="w-full bg-[#5643ff] text-white py-4 rounded-xl font-black uppercase tracking-[2px] active:scale-95 transition-transform">ENTRAR COM GOOGLE</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen p-4 md:p-12 font-sans transition-all duration-700 ${darkMode ? 'bg-[#020617] text-gray-100' : 'bg-[#f8f9ff] text-gray-900'}`}>
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-12 text-left">
        <h1 className="text-4xl font-black tracking-tighter flex items-center gap-4 w-full">
          <span className="bg-gradient-to-r from-[#5643ff] to-fuchsia-500 bg-clip-text text-transparent italic">Gerenciador</span>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 rounded-2xl bg-gray-800/50 hover:bg-gray-700 transition-colors">
            {darkMode ? <Sun size={20} className="text-yellow-400"/> : <Moon size={20}/>}
          </button>
        </h1>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={() => setIsModalOpen(true)} className="flex-1 md:flex-none bg-[#5643ff] hover:bg-[#4532ff] text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-[#5643ff]/40 transition-all active:scale-95">
            <Plus size={18} /> Novo Registro
          </button>
          <button onClick={() => signOut(auth)} className="p-4 rounded-2xl border border-gray-800 hover:bg-red-500/10 hover:text-red-500 transition-all"><LogOut size={20} /></button>
        </div>
      </div>

      {/* CARDS SUPERIORES */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 text-left">
        <div className={`p-8 rounded-[40px] border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${darkMode ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-100'}`}>
          <div className="text-indigo-500 font-black uppercase text-[10px] mb-3 italic tracking-widest">Saldo Atual</div>
          <div className="flex items-center"><span className="text-2xl font-black text-emerald-500 mr-2">R$</span><input type="number" step="0.01" className="bg-transparent text-4xl font-black outline-none w-full text-emerald-500" value={saldoEmConta} onChange={(e) => atualizarSaldoNoBanco(e.target.value)} /></div>
        </div>

        <div className={`p-8 rounded-[40px] border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${darkMode ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-100'}`}>
          <div className="text-red-500 font-black uppercase text-[10px] mb-3 italic tracking-widest">Pendente</div>
          <h3 className="text-4xl font-black text-red-500">R$ {totalPendente.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>

        <div className={`p-8 rounded-[40px] border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${darkMode ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-100'}`}>
          <div className="text-emerald-500 font-black uppercase text-[10px] mb-3 italic tracking-widest">Pago</div>
          <h3 className="text-4xl font-black text-emerald-500">R$ {totalPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>

        <div className={`p-8 rounded-[40px] shadow-2xl bg-gradient-to-br ${statusSobra.cor} ${statusSobra.neon} text-white transition-all duration-500 hover:scale-[1.05]`}>
          <p className="text-white/70 text-[10px] font-black uppercase mb-3 italic tracking-widest">Sobra Final</p>
          <h3 className="text-4xl font-black tracking-tighter">R$ {Math.abs(saldoFinalPositivo).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
          <span className="bg-black/20 px-3 py-1 rounded-full text-[9px] font-black uppercase mt-3 inline-block">{statusSobra.msg}</span>
        </div>
      </div>

      {/* ÁREA DA LISTA */}
      <div className={`max-w-7xl mx-auto rounded-[45px] shadow-2xl border overflow-hidden ${darkMode ? 'bg-gray-900/80 border-white/10' : 'bg-white border-gray-50'}`}>
        <div className="p-10 space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className={`flex items-center gap-4 px-6 py-4 w-full max-w-md rounded-2xl border-2 border-transparent focus-within:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
              <Search className="text-gray-400" size={20} />
              <input type="text" placeholder="Pesquisar..." className="bg-transparent outline-none w-full text-sm font-bold text-left" onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className={`flex p-1.5 rounded-[20px] ${darkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
              {["Pendentes", "Pagos", "Todos"].map((aba) => (
                <button key={aba} onClick={() => setFiltroStatus(aba)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroStatus === aba ? (darkMode ? 'bg-white/10 text-white shadow-lg' : 'bg-white text-[#5643ff] shadow-lg') : 'text-gray-400'}`}>{aba}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto text-left pb-20">
          <table className="w-full min-w-[350px]">
            <thead className="hidden md:table-header-group">
              <tr className={`text-[10px] font-black uppercase tracking-widest text-gray-400 border-b ${darkMode ? 'border-white/5' : 'border-gray-200'}`}>
                <th className="px-6 py-8 text-center italic w-10">#</th>
                <th className="px-6 py-8 italic text-left">Vencimento</th>
                <th className="px-10 py-8 italic text-left">Descrição</th>
                <th className="px-10 py-8 italic text-left">Valor</th>
                <th className="px-10 py-8 italic text-left">Status</th>
                <th className="px-10 py-8 text-right italic">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold">
              {filteredData.map((item) => {
                const cat = getCategoria(item.nome, darkMode);
                const vencido = verificarVencido(item.data, item.status);
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr key={item.id} className={`flex flex-col md:table-row border-b transition-all duration-300 ${
                    isSelected ? (darkMode ? 'bg-[#5643ff]/10' : 'bg-[#5643ff]/5') :
                    vencido ? 'bg-red-500/5' : darkMode ? 'border-white/5 hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50'
                  } p-6 md:p-0`}>
                    
                    <td className="md:px-6 md:py-7 text-center">
                      <button onClick={() => toggleSelection(item.id)} className={`transition-all ${isSelected ? 'text-[#5643ff] scale-125' : 'text-gray-500 hover:text-gray-300'}`}>
                        <CheckCircle2 size={22} fill={isSelected ? "currentColor" : "none"} />
                      </button>
                    </td>

                    <td className="md:px-6 md:py-7 mb-2 md:mb-0">
                      <div className="flex flex-col">
                        <span className={vencido ? "text-red-500 font-black underline" : item.status !== 'Confirmada' ? "text-red-400/70" : "text-gray-400"}>
                          {item.data ? new Date(item.data + "T12:00:00").toLocaleDateString('pt-BR') : "--/--"}
                        </span>
                        {vencido && <span className="text-[8px] font-black text-red-500 flex items-center gap-1 mt-1 animate-pulse"><AlertCircle size={10}/> VENCIDO</span>}
                      </div>
                    </td>

                    <td className="md:px-10 md:py-7 flex flex-col md:table-cell mb-3 md:mb-0">
                      <div className="flex items-center gap-3 text-left group">
                        <span className={`p-2 rounded-lg border transition-transform group-hover:scale-110 ${cat.color}`}>{cat.icon}</span>
                        <span className={`tracking-tight text-base md:text-sm ${vencido ? 'text-red-200' : ''}`}>{item.nome}</span>
                      </div>
                    </td>

                    <td className={`md:table-cell px-10 py-7 text-lg tracking-tighter ${item.status === 'Confirmada' ? 'text-emerald-500' : vencido ? 'text-red-500' : 'text-red-400'}`}>
                      R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </td>

                    <td className="md:px-10 md:py-7 flex justify-between items-center md:table-cell">
                      <select 
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase outline-none cursor-pointer transition-all ${
                          item.status === 'Confirmada' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                        }`} 
                        value={item.status} 
                        onChange={async (e) => await updateDoc(doc(db, "registros", item.id), { status: e.target.value })}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Confirmada">Pago</option>
                      </select>
                    </td>

                    <td className="hidden md:table-cell px-10 py-7 text-right">
                      <div className="flex justify-end gap-4 opacity-40 hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(item.id); setFormData({...item}); setIsModalOpen(true); }} className="text-gray-400 hover:text-indigo-500 hover:scale-125 transition-all"><Edit3 size={18}/></button>
                        <button onClick={async () => { if(window.confirm("Excluir?")) await deleteDoc(doc(db, "registros", item.id)) }} className="text-gray-400 hover:text-red-500 hover:scale-125 transition-all"><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAINEL FLUTUANTE DO TOTALIZADOR */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-10 duration-500">
          <div className="bg-gray-900 border border-[#5643ff]/50 px-8 py-5 rounded-[30px] shadow-[0_0_40px_rgba(86,67,255,0.3)] flex items-center gap-8 backdrop-blur-xl">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest italic">Total Selecionado ({selectedIds.length})</span>
              <span className="text-2xl font-black text-white tracking-tighter">R$ {totalSelecionado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div className="h-10 w-[1px] bg-white/10"></div>
            <button onClick={() => setSelectedIds([])} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
          </div>
        </div>
      )}

      {/* MODAL NOVO REGISTRO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300">
          <div className={`w-full max-w-xl rounded-[50px] p-12 shadow-2xl border transform animate-in zoom-in-95 duration-300 ${darkMode ? 'bg-gray-900 border-white/10 text-white' : 'bg-white border-transparent text-gray-900'}`}>
            <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black italic tracking-tighter">Novo Registro</h2><button onClick={closeModal} className="hover:rotate-90 transition-all p-2 bg-white/5 rounded-full"><X size={24} /></button></div>
            <form onSubmit={handleSubmit} className="space-y-8 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Descrição</label>
                <input required className={`w-full p-5 rounded-2xl outline-none font-bold text-base border-2 border-transparent focus:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} placeholder="O que você comprou?" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Quanto?</label>
                   <input required type="number" step="0.01" className={`w-full p-5 rounded-2xl outline-none font-bold text-base border-2 border-transparent focus:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.valor} onChange={(e) => setFormData({...formData, valor: e.target.value})} placeholder="Valor R$" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-2">Vencimento</label>
                  <input type="date" className={`w-full p-5 rounded-2xl outline-none font-bold text-base border-2 border-transparent focus:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.data} onChange={(e) => setFormData({...formData, data: e.target.value})} />
                </div>
              </div>
              <button type="submit" className="w-full bg-[#5643ff] hover:bg-[#4532ff] text-white py-6 rounded-2xl font-black shadow-xl hover:shadow-[#5643ff]/40 uppercase tracking-widest text-xs transition-all active:scale-95">SALVAR REGISTRO</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetApp;