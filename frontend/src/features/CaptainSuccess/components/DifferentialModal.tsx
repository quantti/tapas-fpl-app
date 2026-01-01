import clsx from 'clsx'

import { Modal } from 'components/Modal'

import * as styles from './DifferentialModal.module.css'

import type { DifferentialPick } from 'services/queries/useCaptainSuccess'

interface Props {
  isOpen: boolean
  onClose: () => void
  teamName: string
  details: DifferentialPick[]
  totalGain: number
}

export function CaptainDifferentialModal({ isOpen, onClose, teamName, details, totalGain }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${teamName} - Differential Captains`}>
      <div className={styles.CaptainDifferentialModal}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.gwCol}>GW</th>
              <th>Your Pick</th>
              <th>Template</th>
              <th className={styles.numCol}>Pts</th>
              <th className={styles.numCol}>Template</th>
              <th className={styles.numCol}>Gain</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.gameweek}>
                <td className={styles.gwCol}>{d.gameweek}</td>
                <td className={styles.playerCell}>
                  {d.captainName}
                  {d.multiplier === 3 && <span className={styles.tcBadge}>TC</span>}
                </td>
                <td className={styles.templateCell}>{d.templateName}</td>
                <td className={styles.numCol}>{d.captainPoints}</td>
                <td className={styles.numCol}>{d.templatePoints}</td>
                <td
                  className={clsx(styles.numCol, d.gain >= 0 ? styles.positive : styles.negative)}
                >
                  {d.gain >= 0 ? '+' : ''}
                  {d.gain}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.totalRow}>
              <td colSpan={5} className={styles.totalLabel}>
                Total
              </td>
              <td
                className={clsx(styles.numCol, totalGain >= 0 ? styles.positive : styles.negative)}
              >
                {totalGain >= 0 ? '+' : ''}
                {totalGain}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  )
}
