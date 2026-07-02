import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';

interface ProfilePageProps {
  onNavigate: (view: string, id: string) => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { currentUser, token, fetchMe } = useAppContext();
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  const handleSaveUsername = async () => {
    if (!newUsername.trim()) return;
    try {
      const res = await fetch('https://api.podsy.pro/api/me/username', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ username: newUsername })
      });
      if (res.ok) {
        setIsEditingUsername(false);
        if (fetchMe) fetchMe();
      } else {
        alert("Failed to update username");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchShops = async () => {
    try {
      const res = await fetch('https://api.podsy.pro/api/me/shops', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setShops(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchShops();
    }
  }, [token]);

  const handleConnectShop = async () => {
    try {
      const res = await fetch('https://api.podsy.pro/etsy/connect', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.auth_url) {
        window.location.href = data.auth_url; // Redirect to Etsy OAuth
      }
    } catch (err) {
      alert("Error connecting to Etsy.");
    }
  };
  const handleDisconnectShop = async (connectionId: number) => {
    if (!window.confirm("Bu mağazanın bağlantısını kesmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`https://api.podsy.pro/api/me/shops/${connectionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchShops();
      } else {
        alert("Error disconnecting.");
      }
    } catch (err) {
      alert("Error: " + err);
    }
  };

  return (
    <div className="p-8 animate-[fadeIn_0.3s]">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Profil & Mağazalarım</h2>
          <p className="text-zinc-500 font-bold mt-2">PodsyPro hesabınız ve bağlı Etsy mağazalarınız</p>
        </div>
      </div>

      <div className="bg-[#111] p-6 rounded-3xl border border-[#222] shadow-2xl mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-sky-500 to-emerald-500 flex items-center justify-center text-2xl font-black text-white overflow-hidden">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              currentUser?.username?.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            {isEditingUsername ? (
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={newUsername} 
                  onChange={(e) => setNewUsername(e.target.value)} 
                  className="bg-black border border-[#333] text-white px-2 py-1 rounded text-lg font-bold"
                  autoFocus
                />
                <button onClick={handleSaveUsername} className="bg-emerald-500 text-black px-3 py-1 rounded font-bold text-sm">Save</button>
                <button onClick={() => setIsEditingUsername(false)} className="text-zinc-500 hover:text-white px-2 py-1 rounded font-bold text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">{currentUser?.username}</h3>
                <button onClick={() => { setIsEditingUsername(true); setNewUsername(currentUser?.username || ''); }} className="text-zinc-600 hover:text-sky-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
              </div>
            )}
            <p className="text-sm text-zinc-500">{currentUser?.email || 'Plan: SaaS Pro Tier'}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-white uppercase tracking-wider">Bağlı Mağazalarınız ({shops.length})</h3>
        <button 
          onClick={handleConnectShop}
          className="bg-emerald-500 text-black font-black px-6 py-2 rounded-xl hover:bg-emerald-400 transition"
        >
          + YENİ MAĞAZA BAĞLA
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-500 font-mono">Loading...</div>
      ) : shops.length === 0 ? (
        <div className="bg-[#111] p-12 rounded-3xl border border-[#222] border-dashed text-center">
          <p className="text-zinc-500 font-bold mb-4">You do not have a connected Etsy shop yet.</p>
          <button 
            onClick={handleConnectShop}
            className="bg-zinc-800 text-white font-bold px-6 py-2 rounded-lg hover:bg-zinc-700 transition"
          >
            İlk Mağazanızı Bağlayın
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shops.map((shop, idx) => (
            <div key={idx} className="bg-[#111] p-6 rounded-3xl border border-[#222] hover:border-emerald-500/50 transition group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500 font-black overflow-hidden">
                  {shop.icon_url ? (
                    <img src={shop.icon_url} alt={shop.shop_name} className="w-full h-full object-cover" />
                  ) : (
                    shop.shop_name?.charAt(0).toUpperCase() || 'E'
                  )}
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md font-bold uppercase tracking-widest">
                  Aktif (Full Access)
                </span>
              </div>
              <h4 className="text-lg font-bold text-white mb-1">{shop.shop_name || 'Bilinmeyen Mağaza'}</h4>
              <p className="text-xs text-zinc-500 font-mono mb-4">ID: {shop.etsy_shop_id}</p>
              
              <div className="pt-4 border-t border-zinc-800 flex gap-2">
                <button 
                  onClick={() => onNavigate('shop', shop.etsy_shop_id)}
                  className="flex-1 bg-sky-500/10 text-sky-500 border border-sky-500/20 text-xs font-bold py-2 rounded-lg hover:bg-sky-500 hover:text-white transition text-center"
                >
                  Mağazayı İncele
                </button>
                <button
                  onClick={() => handleDisconnectShop(shop.id)}
                  className="px-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-bold py-2 rounded-lg hover:bg-rose-500 hover:text-white transition"
                  title="Bağlantıyı Kes"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
