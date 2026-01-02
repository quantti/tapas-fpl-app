import { Modal } from './Modal';
import * as styles from './PlayerOwnershipModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  teamNames: string[];
}

export function PlayerOwnershipModal({ isOpen, onClose, playerName, teamNames }: Props) {
  const sortedTeams = [...teamNames].sort((a, b) => a.localeCompare(b));
  const teamWord = teamNames.length === 1 ? 'team' : 'teams';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${playerName} - Owned by ${teamNames.length} ${teamWord}`}
    >
      <div className={styles.PlayerOwnershipModal}>
        <ul className={styles.list}>
          {sortedTeams.map((teamName) => (
            <li key={teamName} className={styles.item}>
              {teamName}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
