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
    
    // LÓGICA DE RECORRÊNCIA: Se marcar como Pago e for recorrente, cria o próximo mês
    if (novoStatus === 'Confirmada' && item.recorrente && item.data) {
      const dataAtual = new Date(item.data + "T12:00:00");
      dataAtual.setMonth(dataAtual.getMonth() + 1);
      const novaDataStr = dataAtual.toISOString().split('T')[0];

      // Verifica se já existe uma conta com mesmo nome e data para não duplicar
      const jaExiste = data.find(d => d.nome === item.nome && d.data === novaDataStr);
      
      if (!jaExiste) {
        await addDoc(collection(db, "registros"), {
          nome: item.nome,
          valor: item.valor,
          status: 'Pendente',
          data: novaDataStr,
          recorrente: true,
          userId: user.uid
        });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorNum = parseFloat(formData.valor) || 0;
    if (editingId) await updateDoc(doc(db, "registros", editingId), { ...formData, valor: valorNum });
    else await addDoc(collection(db, "registros"), { ...formData, valor: valorNum, userId: user.uid });
    closeModal();
  };

  const closeModal = () => { 
    setIsModalOpen(false); 
    setEditingId(null); 
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

  if (!user) return <div className="min-h-screen bg-[#020617]" />;

  return (
    <div className={`min-h-screen p-4 md:p-12 transition-all duration-700 ${darkMode ? 'bg-[#020617] text-gray-100' : 'bg-[#f8f9ff] text-gray-900'}`}>
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
        <h1 className="text-4xl font-black tracking-tighter flex items-center gap-4 text-left w-full">
          <span className="bg-gradient-to-r from-[#5643ff] to-fuchsia-500 bg-clip-text text-transparent italic">Gerenciador</span>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 rounded-2xl bg-gray-800/50 hover:bg-gray-700 transition-colors">
            {darkMode ? <Sun size={20} className="text-yellow-400"/> : <Moon size={20}/>}
          </button>
        </h1>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={() => setIsModalOpen(true)} className="flex-1 md:flex-none bg-[#5643ff] text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
            <Plus size={18} /> Novo Registro
          </button>
          <button onClick={() => signOut(auth)} className="p-4 rounded-2xl border border-white/5 hover:bg-red-500/10 hover:text-red-500 transition-all"><LogOut size={20} /></button>
        </div>
      </div>

      {/* CARDS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className={`p-8 rounded-[40px] border transition-all ${darkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="text-indigo-500 font-black uppercase text-[10px] mb-3 italic tracking-widest">Saldo Atual</div>
          <div className="flex items-center"><span className="text-2xl font-black text-emerald-500 mr-2">R$</span><input type="number" step="0.01" className="bg-transparent text-4xl font-black outline-none w-full text-emerald-500" value={saldoEmConta} onChange={(e) => setSaldoEmConta(e.target.value)} /></div>
        </div>
        <div className={`p-8 rounded-[40px] border transition-all ${darkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="text-red-500 font-black uppercase text-[10px] mb-3 italic tracking-widest">Pendente</div>
          <h3 className="text-4xl font-black text-red-500">R$ {totalPendente.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>
        <div className={`p-8 rounded-[40px] border transition-all ${darkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="text-emerald-500 font-black uppercase text-[10px] mb-3 italic tracking-widest">Pago</div>
          <h3 className="text-4xl font-black text-emerald-500">R$ {totalPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>
        <div className={`p-8 rounded-[40px] shadow-2xl bg-gradient-to-br from-[#5643ff] to-purple-600 text-white transition-all`}>
          <p className="text-white/70 text-[10px] font-black uppercase mb-3 italic tracking-widest">Sobra Final</p>
          <h3 className="text-4xl font-black tracking-tighter">R$ {Math.abs(saldoFinalPositivo).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
        </div>
      </div>

      {/* ÁREA DA TABELA */}
      <div className={`max-w-7xl mx-auto rounded-[45px] shadow-2xl border overflow-hidden ${darkMode ? 'bg-gray-900/80 border-white/5' : 'bg-white border-gray-50'}`}>
        <div className="p-10 space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className={`flex items-center gap-4 px-6 py-4 w-full max-w-md rounded-2xl ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
              <Search className="text-gray-400" size={20} />
              <input type="text" placeholder="Pesquisar..." className="bg-transparent outline-none w-full text-sm font-bold" onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className={`flex p-1.5 rounded-[20px] ${darkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
              {["Pendentes", "Pagos", "Todos"].map((aba) => (
                <button key={aba} onClick={() => setFiltroStatus(aba)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroStatus === aba ? 'bg-[#5643ff] text-white' : 'text-gray-400'}`}>{aba}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto pb-20">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                <th className="px-6 py-8 text-center italic">SEL.</th>
                <th className="px-10 py-8 text-left italic">Vencimento</th>
                <th className="px-10 py-8 text-left italic">Descrição</th>
                <th className="px-10 py-8 text-left italic">Valor</th>
                <th className="px-10 py-8 text-left italic">Status</th>
                <th className="px-10 py-8 text-right italic">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold">
              {filteredData.map((item) => {
                const cat = getCategoria(item.nome, darkMode);
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr key={item.id} className={`transition-all duration-300 border-b border-white/[0.02] ${isSelected ? 'bg-[#5643ff]/10' : darkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50'}`}>
                    
                    {/* CHECKBOX QUADRADO */}
                    <td className="px-6 py-7 text-center">
                      <button 
                        onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])} 
                        className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center mx-auto ${
                          isSelected ? 'bg-[#5643ff] border-[#5643ff]' : 'border-gray-600 hover:border-[#5643ff]'
                        }`}
                      >
                        {isSelected && <X size={12} className="text-white" strokeWidth={4} />}
                      </button>
                    </td>

                    <td className="px-10 py-7 text-gray-400">
                      {item.data ? new Date(item.data + "T12:00:00").toLocaleDateString('pt-BR') : "--/--"}
                    </td>

                    <td className="px-10 py-7">
                      <div className="flex items-center gap-3">
                        <span className={`p-2 rounded-lg ${cat.color}`}>{cat.icon}</span>
                        <div className="flex flex-col">
                          <span className="text-base">{item.nome}</span>
                          {item.recorrente && <span className="text-[9px] text-indigo-400 flex items-center gap-1 uppercase tracking-tighter"><RefreshCcw size={8}/> Conta Fixa</span>}
                        </div>
                      </div>
                    </td>

                    <td className={`px-10 py-7 text-lg tracking-tighter ${item.status === 'Confirmada' ? 'text-emerald-500' : 'text-red-400'}`}>
                      R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </td>

                    <td className="px-10 py-7">
                      <select 
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase outline-none cursor-pointer ${
                          item.status === 'Confirmada' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                        }`} 
                        value={item.status} 
                        onChange={(e) => handleStatusChange(item, e.target.value)}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Confirmada">Pago</option>
                      </select>
                    </td>

                    <td className="px-10 py-7 text-right">
                      <div className="flex justify-end gap-4 opacity-40 hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(item.id); setFormData({...item}); setIsModalOpen(true); }} className="hover:text-indigo-500 transition-all"><Edit3 size={18}/></button>
                        <button onClick={async () => { if(window.confirm("Excluir?")) await deleteDoc(doc(db, "registros", item.id)) }} className="hover:text-red-500 transition-all"><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL COM RECORRÊNCIA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className={`w-full max-w-xl rounded-[50px] p-12 border ${darkMode ? 'bg-gray-900 border-white/10 text-white' : 'bg-white border-transparent text-gray-900'}`}>
            <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black italic tracking-tighter">Novo Registro</h2><button onClick={closeModal}><X size={24} /></button></div>
            <form onSubmit={handleSubmit} className="space-y-8">
              <input required className={`w-full p-5 rounded-2xl outline-none font-bold border-2 border-transparent focus:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} placeholder="Descrição" />
              <div className="grid grid-cols-2 gap-6">
                <input required type="number" step="0.01" className={`w-full p-5 rounded-2xl outline-none font-bold border-2 border-transparent focus:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.valor} onChange={(e) => setFormData({...formData, valor: e.target.value})} placeholder="Valor R$" />
                <input type="date" className={`w-full p-5 rounded-2xl outline-none font-bold border-2 border-transparent focus:border-[#5643ff] transition-all ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`} value={formData.data} onChange={(e) => setFormData({...formData, data: e.target.value})} />
              </div>
              
              {/* CAMPO DE RECORRÊNCIA NO FORMULÁRIO */}
              <label className="flex items-center gap-3 cursor-pointer p-2 group">
                <div 
                  onClick={() => setFormData({...formData, recorrente: !formData.recorrente})}
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${formData.recorrente ? 'bg-[#5643ff] border-[#5643ff]' : 'border-gray-600'}`}
                >
                  {formData.recorrente && <X size={14} className="text-white" strokeWidth={4} />}
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-indigo-400 transition-colors">Conta Fixa (Repetir todo mês)</span>
              </label>

              <button type="submit" className="w-full bg-[#5643ff] text-white py-6 rounded-2xl font-black shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all">SALVAR REGISTRO</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetApp;