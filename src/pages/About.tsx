export default function About() {
  return (
    <div style={{ maxWidth: '68ch' }}>
      <header className="step-head">
        <h1>About this tool</h1>
      </header>
      <p>
        Rules content comes from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at{' '}
        <a href="https://www.dndbeyond.com/srd">dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
        International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode">creativecommons.org/licenses/by/4.0/legalcode</a>.
      </p>
      <p>
        The 2014 rule set uses the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC, available at{' '}
        <a href="https://dnd.wizards.com/resources/systems-reference-document">dnd.wizards.com/resources/systems-reference-document</a>, also
        licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode">Creative Commons Attribution 4.0 International License</a>.
        SRD material has been adapted and reformatted for this app.
      </p>
      <p>
        Structured data is adapted from the <a href="https://github.com/5e-bits/5e-database">5e-bits 5e-database</a> project (MIT licence, © Adrian Padua and Christopher Ward).
      </p>
      <p>
        This tool is unofficial fan content and is not affiliated with or endorsed by Wizards of the Coast. Content you add on the Rules
        packs page is stored only in your browser.
      </p>
    </div>
  );
}
