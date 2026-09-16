import type { MockPlayer } from './devDataTypes'

const men = 'Marco Luca Matteo Andrea Lorenzo Alessandro Francesco Davide Simone Federico Riccardo Stefano Antonio Giovanni Paolo Diego Pablo Javier Carlos Miguel Alejandro Rafael Sergio Fernando Nicolas Alberto Roberto Leonardo Enrico Gabriele'.split(' ')
const women = 'Giulia Sofia Aurora Alice Emma Martina Chiara Sara Francesca Valentina Elena Laura Marta Silvia Alessia Beatrice Camilla Giorgia Federica Irene Lucia Isabel Carmen Ana Paula Daniela Gabriela Natalia Victoria Clara'.split(' ')
const surnames = 'Rossi Bianchi Ferrari Esposito Romano Colombo Ricci Marino Greco Bruno Gallo Conti Costa Giordano Mancini Rizzo Lombardi Moretti Barbieri Fontana Garcia Rodriguez Martinez Lopez Sanchez Perez Gomez Fernandez Ruiz Alvarez Romero Navarro Torres Ortega Ramos'.split(' ')

export const mockPlayers: readonly MockPlayer[] = Object.freeze(Array.from({ length: 99 }, (_, i) => {
  const team = Math.floor(i / 3)
  const male = team < 11 || (team >= 22 && i % 3 < ((team - 22) % 2 === 0 ? 2 : 1))
  return Object.freeze({ id: `mock-player-${String(i + 1).padStart(3, '0')}`, firstName: (male ? men : women)[i % 30], lastName: surnames[i % surnames.length], gender: male ? 'male' as const : 'female' as const })
}))
