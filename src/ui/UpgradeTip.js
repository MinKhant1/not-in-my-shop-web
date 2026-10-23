export class UpgradeTip {
  constructor(root) {
    this.panel = document.createElement('aside');
    this.panel.id = 'upgrade-tip';
    this.panel.hidden = true;
    this.title = document.createElement('h2');
    this.body = document.createElement('p');
    this.panel.append(this.title, this.body);
    root?.append(this.panel);
    this.shownId = '';
    this.shownText = '';
  }

  show(pad) {
    if (!pad?.summary) {
      this.hide();
      return;
    }
    const text = `${pad.name}\n${pad.summary}`;
    if (this.shownId !== pad.id || this.shownText !== text) {
      this.shownId = pad.id;
      this.shownText = text;
      this.title.textContent = pad.name;
      this.body.textContent = pad.summary;
    }
    this.panel.hidden = false;
  }

  hide() {
    if (this.panel.hidden) {
      return;
    }
    this.panel.hidden = true;
    this.shownId = '';
    this.shownText = '';
  }
}
