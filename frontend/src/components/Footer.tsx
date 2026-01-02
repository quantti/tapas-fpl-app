import * as styles from './Footer.module.css';

export function Footer() {
  const startYear = 2025;
  const currentYear = new Date().getFullYear();
  const yearDisplay = currentYear > startYear ? `${startYear}–${currentYear}` : `${startYear}`;

  return (
    <footer className={styles.Footer}>
      <p>© {yearDisplay} Kari Vänttinen</p>
    </footer>
  );
}
