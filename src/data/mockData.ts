import { Simulado } from '../types';

export const MOCK_SIMULADOS: Simulado[] = [
  {
    id: 's1',
    title: 'ENEM - Dia 1',
    description: 'Linguagens, Códigos e suas Tecnologias + Ciências Humanas e suas Tecnologias',
    year: 2023,
    totalQuestions: 90,
    durationMinutes: 330, // 5h 30min
    xpReward: 500
  },
  {
    id: 's2',
    title: 'ENEM - Dia 2',
    description: 'Ciências da Natureza e suas Tecnologias + Matemática e suas Tecnologias',
    year: 2023,
    totalQuestions: 90,
    durationMinutes: 300, // 5h 00min
    xpReward: 500
  }
];

export const ENEM_YEARS = [2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009];
export const ENEM_SUBJECTS = ['Linguagens', 'Matemática', 'Ciências da Natureza', 'Ciências Humanas'];
