import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { GoogleLogin } from '@react-oauth/google';

const LoginPage: React.FC = () => {
  const { loginWithGoogle } = useAppContext();
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = async (credentialResponse: any) => {
    try {
      if (!credentialResponse.credential) throw new Error("No credential received");
      await loginWithGoogle(credentialResponse.credential);
    } catch (err: any) {
      setError(err.message || 'Google Login failed.');
    }
  };

  const handleError = () => {
    setError('Google Login was unsuccessful or canceled.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] p-4 text-zinc-100">
      <div className="max-w-md w-full bg-[#111] p-8 rounded-3xl border border-[#222] shadow-2xl relative overflow-hidden text-center flex flex-col items-center">
        {/* Decorative blur */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-sky-500/10 blur-[50px] -z-10 rounded-full"></div>
        
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-indigo-400 mb-2">PodsyPro</h1>
          <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Smart Shop Management</p>
        </div>

        {error && <div className="text-rose-500 text-sm font-bold bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 mb-6 w-full">{error}</div>}

        <div className="w-full flex justify-center">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            use_fedcm_for_prompt={false}
            theme="filled_black"
            shape="pill"
            size="large"
            text="continue_with"
          />
        </div>
        
        <p className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest mt-8">
          Secure Login Powered by Google
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
