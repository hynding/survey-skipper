class Answer {

  constructor({text, value, isCustom}) {
    this.text = text || value;
    this.value = sanitize(value);
    this.isCustom = isCustom || false;
  }

  isValid() {
    return this.value !== '' && this.value !== null && this.value !== undefined;
  }
}

module.exports = Answer;

function sanitize(value) {
  if (value===true) {
    return 1;
  }
  else if (value===false) {
    return 0;
  }
  else {
    return value;
  }
}