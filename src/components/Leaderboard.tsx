import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Medal, Crown, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';
import { userService } from '../services/userService';

interface LeaderboardProps {
  user: UserProfile;
}

export default function Leaderboard({ user }: LeaderboardProps) {
  const [ranking, setRanking] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const data = await userService.getLeaderboard();
        setRanking(data);
      } catch (error) {
        console.error('Failed to fetch ranking:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRanking();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    );
  }

  const sortedRanking = ranking.length > 0 ? ranking : [];
  
  // Minimal data to avoid crash if ranking is empty
  const placeholders = [
    { name: 'Em breve...', xp: 0, level: 0, id: 'p1' },
    { name: 'Em breve...', xp: 0, level: 0, id: 'p2' },
    { name: 'Em breve...', xp: 0, level: 0, id: 'p3' },
  ];

  const displayRanking = sortedRanking.length >= 3 ? sortedRanking : [...sortedRanking, ...placeholders].slice(0, 3);
  const fullRanking = sortedRanking.length > 0 ? sortedRanking : [];

  return (
    <div className="max-w-4xl mx-auto pt-24 pb-32 px-4 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <header className="mb-12 text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-primary/10 text-brand-primary rounded-[24px] md:rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-primary/5">
            <Trophy size={32} className="md:w-10 md:h-10" />
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-text-main tracking-tight mb-2">Hall da Fama</h1>
          <p className="text-text-secondary font-bold text-[10px] opacity-40">Os estudantes que mais se engajaram nessa jornada de estudos.</p>
        </header>

        <div className="flex justify-center items-end gap-3 sm:gap-6 mb-20 px-0 sm:px-4 h-72 md:h-96">
          {/* Top 3 podium slots */}
          {/* Rank 2 */}
          <div className="flex-1 flex flex-col items-center h-full justify-end">
            <motion.div 
               initial={{ height: 0, opacity: 0 }} 
               animate={{ height: '52%', opacity: 1 }} 
               transition={{ delay: 0.2, duration: 1, ease: 'easeOut' }}
               className="w-full bg-gradient-to-t from-slate-200/5 to-slate-400/20 dark:from-slate-800/80 dark:to-slate-900/40 border border-slate-400/30 rounded-t-[20px] md:rounded-t-[28px] relative flex flex-col items-center justify-end pb-4 pt-12"
            >
              {/* Floating Avatar with Rank Badge */}
              <div className="absolute top-0 -translate-y-1/2 flex flex-col items-center">
                <div className="relative">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-bg-card border-2 border-slate-400 flex items-center justify-center font-black text-slate-500 text-sm md:text-lg shadow-lg">
                    {displayRanking[1]?.name?.charAt(0) || '?'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-slate-400 text-white font-extrabold text-[10px] md:text-xs flex items-center justify-center border border-white dark:border-slate-800">
                    2
                  </div>
                </div>
              </div>
              
              {/* Massive Backdrop text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <span className="text-3xl md:text-5xl font-black text-slate-400/10 tracking-tighter">2º</span>
              </div>

              {/* Pillar Score */}
              <div className="z-10 text-center px-1 mb-1">
                <span className="text-[10px] md:text-xs font-black text-slate-400">{(displayRanking[1]?.xp || 0).toLocaleString()} XP</span>
              </div>
            </motion.div>
            <p className="text-[10px] md:text-sm font-black mt-3 text-center text-text-secondary truncate w-full px-1">
              {displayRanking[1]?.name || '---'}
            </p>
          </div>

          {/* Rank 1 */}
          <div className="flex-1 flex flex-col items-center h-full justify-end">
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: '72%', opacity: 1 }} 
              transition={{ delay: 0, duration: 1, ease: 'easeOut' }}
              className="w-full bg-gradient-to-t from-yellow-500/10 to-yellow-600/30 dark:from-yellow-950/40 dark:to-yellow-750/10 border border-yellow-500/40 rounded-t-[24px] md:rounded-t-[32px] relative flex flex-col items-center justify-end pb-5 pt-16 shadow-[0_0_40px_rgba(234,179,8,0.15)]"
            >
              {/* Floating Avatar with Crown */}
              <div className="absolute top-0 -translate-y-1/2 flex flex-col items-center">
                <div className="relative">
                  {/* Floating Golden Crown above the avatar */}
                  <div className="absolute -top-5 md:-top-7 left-1/2 -translate-x-1/2">
                    <Crown size={22} className="text-yellow-500 drop-shadow-[0_2px_4px_rgba(234,179,8,0.4)] md:w-7 md:h-7" />
                  </div>
                  <div className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-bg-card border-2 border-yellow-500 flex items-center justify-center font-black text-yellow-600 text-base md:text-2xl shadow-xl">
                    {displayRanking[0]?.name?.charAt(0) || '?'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 md:w-7 md:h-7 rounded-full bg-yellow-500 text-white font-extrabold text-xs flex items-center justify-center border border-white dark:border-yellow-950">
                    1
                  </div>
                </div>
              </div>

              {/* Massive Backdrop text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <span className="text-4xl md:text-6xl font-black text-yellow-500/10 tracking-tighter">1º</span>
              </div>

              {/* Pillar Score */}
              <div className="z-10 text-center px-1 mb-1">
                <span className="text-[10px] md:text-xs font-black text-yellow-500 dark:text-yellow-400">
                  <span className="text-yellow-500">🏆</span> {(displayRanking[0]?.xp || 0).toLocaleString()} XP
                </span>
              </div>
            </motion.div>
            <p className="text-xs md:text-base font-black mt-3 text-center text-text-main truncate w-full px-1">
              {displayRanking[0]?.name || '---'}
            </p>
          </div>

          {/* Rank 3 */}
          <div className="flex-1 flex flex-col items-center h-full justify-end">
            <motion.div 
               initial={{ height: 0, opacity: 0 }} 
               animate={{ height: '40%', opacity: 1 }} 
               transition={{ delay: 0.4, duration: 1, ease: 'easeOut' }}
               className="w-full bg-gradient-to-t from-amber-600/5 to-amber-800/20 dark:from-amber-950/40 dark:to-amber-850/10 border border-amber-800/30 rounded-t-[20px] md:rounded-t-[28px] relative flex flex-col items-center justify-end pb-4 pt-12"
            >
              {/* Floating Avatar with Rank Badge */}
              <div className="absolute top-0 -translate-y-1/2 flex flex-col items-center">
                <div className="relative">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-bg-card border-2 border-amber-700 flex items-center justify-center font-black text-amber-700 text-sm md:text-lg shadow-lg">
                    {displayRanking[2]?.name?.charAt(0) || '?'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-amber-700 text-white font-extrabold text-[10px] md:text-xs flex items-center justify-center border border-white dark:border-amber-950">
                    3
                  </div>
                </div>
              </div>

              {/* Massive Backdrop text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <span className="text-2xl md:text-4xl font-black text-amber-600/10 tracking-tighter">3º</span>
              </div>

              {/* Pillar Score */}
              <div className="z-10 text-center px-1 mb-1">
                <span className="text-[10px] md:text-xs font-black text-amber-600">{(displayRanking[2]?.xp || 0).toLocaleString()} XP</span>
              </div>
            </motion.div>
            <p className="text-[10px] md:text-sm font-black mt-3 text-center text-text-secondary truncate w-full px-1">
              {displayRanking[2]?.name || '---'}
            </p>
          </div>
        </div>

        <div className="bg-bg-card/20 backdrop-blur-sm border border-border-color rounded-[40px] overflow-hidden">
          {fullRanking.length > 0 ? (
            fullRanking.map((entry, index) => {
              const isMe = entry.email === user.email || entry.id === user.id;
              return (
                <motion.div
                  key={entry.id || index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className={`flex items-center justify-between p-6 transition-colors border-b border-border-color last:border-0 ${isMe ? 'bg-brand-primary/10' : ''}`}
                >
                  <div className="flex items-center gap-6">
                    <span className={`w-6 font-black text-lg text-center ${
                      index === 0 ? 'text-yellow-500' : 
                      index === 1 ? 'text-slate-400' : 
                      index === 2 ? 'text-amber-700' : 
                      'text-text-secondary opacity-50'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="w-12 h-12 rounded-2xl bg-bg-sidebar border border-border-color flex items-center justify-center font-black text-text-secondary Transition-colors">
                      {entry.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className={`font-bold tracking-tight ${isMe ? 'text-brand-primary' : 'text-text-main'}`}>{entry.name || 'Estudante'} {isMe && '(Você)'}</p>
                      <p className="text-[10px] font-bold text-text-secondary opacity-50 mt-0.5">Nível {entry.level || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-text-main text-lg">{(entry.xp || 0).toLocaleString()} <span className="text-xs text-text-secondary opacity-50 ml-1">XP</span></p>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="p-12 text-center">
              <p className="text-text-secondary font-bold uppercase tracking-widest opacity-40">Nenhum estudante no ranking ainda.</p>
            </div>
          )}
        </div>

      </motion.div>
    </div>
  );
}

