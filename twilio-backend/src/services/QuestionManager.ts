export class QuestionManager {
  private questions = [
    "What's your name?",
    "Do you live alone?",
    "Do you have any allergies?",
  ];
  getQuestion(index: number) { return this.questions[index]; }
  isComplete(index: number) { return index >= this.questions.length; }
}
