import * as moment from 'moment';
import { Phase } from '../models/phase.model';
import { IssueComment } from './comment.model';
import { GithubComment } from './github/github-comment.model';
import { GithubIssue } from './github/github-issue.model';
import { GithubLabel } from './github/github-label.model';
import { HiddenData } from './hidden-data.model';
import { IssueDispute } from './issue-dispute.model';
import { Milestone } from './milestone.model';
import { Team } from './team.model';
import { TeamAcceptedTemplate } from './templates/team-accepted-template.model';
import { TeamResponseTemplate } from './templates/team-response-template.model';
import { TesterResponseTemplate } from './templates/tester-response-template.model';
import { TutorModerationIssueTemplate } from './templates/tutor-moderation-issue-template.model';
import { TutorModerationTodoTemplate } from './templates/tutor-moderation-todo-template.model';
import { TesterResponse } from './tester-response.model';

export class Issue {
  /** Basic Fields */
  readonly globalId: string;
  readonly id: number;
  readonly created_at: string;
  readonly githubIssue: GithubIssue;
  githubComments: GithubComment[];
  title: string;
  description: string;
  hiddenDataInDescription: HiddenData;
  updated_at: string;
  closed_at: string;
  milestone: Milestone;
  state: string;
  issueOrPr: string;
  author: string;

  /** Fields derived from Labels */
  severity: string;
  type: string;
  responseTag?: string;
  duplicated?: boolean;
  status?: string;
  pending?: string;
  unsure?: boolean;
  teamAssigned?: Team;

  /** Depending on the phase, assignees attribute can be derived from Github's assignee feature OR from the Github's issue description */
  assignees?: string[];
  labels?: string[];
  githubLabels?: GithubLabel[];

  /** Fields derived from parsing of Github's issue description */
  duplicateOf?: number;
  teamResponse?: string;
  testerResponses?: TesterResponse[];
  testerDisagree?: boolean; // whether tester agrees or disagree to teams reponse
  issueComment?: IssueComment; // Issue comment is used for Tutor Response and Tester Response
  issueDisputes?: IssueDispute[];
  teamChosenSeverity?: string;
  teamChosenType?: string;
  teamAccepted?: boolean;

  /** Fields for error messages during parsing of Github's issue description */
  teamResponseError: boolean;
  testerResponseError: boolean;

  /**
   * Formats the text to create space at the end of the user input to prevent any issues with
   * the markdown interpretation.
   *
   * Brought over from comment-editor.component.ts
   */
  static formatText(text: string): string {
    if (text === null) {
      return null;
    }

    if (text === undefined) {
      return undefined;
    }

    const newLinesRegex = /[\n\r]/gi;
    const textSplitArray = text.split(newLinesRegex);
    if (textSplitArray.filter((split) => split.trim() !== '').length > 0) {
      return `${text}\n\n`;
    } else {
      return text;
    }
  }

  /**
   * Processes and cleans a raw issue description obtained from user input.
   */
  static updateDescription(description: string): string {
    const defaultString = 'No details provided by bug reporter.';
    return Issue.orDefaultString(Issue.formatText(description), defaultString);
  }

  /**
   * Processes and cleans a raw team response obtained from user input.
   */
  static updateTeamResponse(teamResponse: string): string {
    const defaultString = 'No details provided by team.';
    return Issue.orDefaultString(Issue.formatText(teamResponse), defaultString);
  }

  /**
   * Given two strings, returns the first if it is not an empty string or a false value such as null/undefined.
   * Returns the second string if the first is an empty string.
   */
  private static orDefaultString(stringA: string, def: string): string {
    if (!stringA) {
      return def;
    }
    return stringA.length !== 0 ? stringA : def;
  }

  protected constructor(githubIssue: GithubIssue) {
    /** Basic Fields */
    this.globalId = githubIssue.id;
    this.id = +githubIssue.number;
    this.created_at = moment(githubIssue.created_at).format('lll');
    this.updated_at = moment(githubIssue.updated_at).format('lll');
    this.closed_at = moment(githubIssue.closed_at).format('lll');
    this.title = githubIssue.title;
    this.hiddenDataInDescription = new HiddenData(githubIssue.body);
    this.description = Issue.updateDescription(this.hiddenDataInDescription.originalStringWithoutHiddenData);
    // githubIssue without milestone will be set to default milestone
    this.milestone = githubIssue.milestone ? new Milestone(githubIssue.milestone) : Milestone.DefaultMilestone;
    this.state = githubIssue.state;
    this.issueOrPr = githubIssue.issueOrPr;
    this.author = githubIssue.user.login;
    // this.githubIssue = githubIssue;

    this.assignees = githubIssue.assignees.map((assignee) => assignee.login);
    this.githubLabels = githubIssue.labels;
    this.labels = githubIssue.labels.map((label) => label.name);

    /** Fields derived from Labels */
    this.severity = githubIssue.findLabel(GithubLabel.LABELS.severity);
    this.type = githubIssue.findLabel(GithubLabel.LABELS.type);
    this.responseTag = githubIssue.findLabel(GithubLabel.LABELS.response);
    this.duplicated = !!githubIssue.findLabel(GithubLabel.LABELS.duplicated, false);
    this.status = githubIssue.findLabel(GithubLabel.LABELS.status);
    this.pending = githubIssue.findLabel(GithubLabel.LABELS.pending);
  }

  public static createPhaseBugReportingIssue(githubIssue: GithubIssue): Issue {
    return new Issue(githubIssue);
  }

  public static createPhaseTeamResponseIssue(githubIssue: GithubIssue, teamData: Team): Issue {
    const issue = new Issue(githubIssue);
    const template = new TeamResponseTemplate(githubIssue.comments);

    issue.githubComments = githubIssue.comments;
    issue.teamAssigned = teamData;
    issue.assignees = githubIssue.assignees.map((assignee) => assignee.login);

    issue.teamResponseError = template.parseFailure;
    issue.issueComment = template.comment;
    issue.teamResponse = template.teamResponse && Issue.updateTeamResponse(template.teamResponse.content);
    issue.duplicateOf = template.duplicateOf && template.duplicateOf.issueNumber;
    issue.duplicated = issue.duplicateOf !== undefined && issue.duplicateOf !== null;

    return issue;
  }

  public static createPhaseTesterResponseIssue(githubIssue: GithubIssue): Issue {
    const issue = new Issue(githubIssue);
    const testerResponseTemplate = new TesterResponseTemplate(githubIssue.comments);
    const teamAcceptedTemplate = new TeamAcceptedTemplate(githubIssue.comments);

    issue.githubComments = githubIssue.comments;
    issue.testerResponseError = testerResponseTemplate.parseFailure && teamAcceptedTemplate.parseFailure;
    issue.teamAccepted = teamAcceptedTemplate.teamAccepted;
    issue.issueComment = testerResponseTemplate.comment;
    issue.teamResponse = testerResponseTemplate.teamResponse && Issue.updateTeamResponse(testerResponseTemplate.teamResponse.content);
    issue.testerResponses = testerResponseTemplate.testerResponse && testerResponseTemplate.testerResponse.testerResponses;
    issue.testerDisagree = testerResponseTemplate.testerDisagree;

    issue.teamChosenSeverity = testerResponseTemplate.teamChosenSeverity || null;
    issue.teamChosenType = testerResponseTemplate.teamChosenType || null;

    return issue;
  }

  public static createPhaseModerationIssue(githubIssue: GithubIssue, teamData: Team): Issue {
    const issue = new Issue(githubIssue);
    const issueTemplate = new TutorModerationIssueTemplate(githubIssue);
    const todoTemplate = new TutorModerationTodoTemplate(githubIssue.comments);

    issue.githubComments = githubIssue.comments;
    issue.teamAssigned = teamData;
    issue.description = issueTemplate.description.content;
    issue.teamResponse = issueTemplate.teamResponse && Issue.updateTeamResponse(issueTemplate.teamResponse.content);
    issue.issueDisputes = issueTemplate.dispute.disputes;

    if (todoTemplate.moderation && todoTemplate.comment) {
      issue.issueDisputes = todoTemplate.moderation.disputesToResolve.map((dispute, i) => {
        dispute.description = issueTemplate.dispute.disputes[i].description;
        return dispute;
      });
      issue.issueComment = todoTemplate.comment;
    }
    return issue;
  }

  /**
   * Creates a new copy of an exact same issue.
   * This would come useful in the event when you want to update the issue but not the actual
   * state of the application.
   */
  clone(phase: Phase): Issue {
    switch (phase) {
      case Phase.issuesViewer:
        return Issue.createPhaseBugReportingIssue(this.githubIssue);
      default:
        return Issue.createPhaseBugReportingIssue(this.githubIssue);
    }
  }

  /**
   * Depending on the phase of the peer testing, each phase will have a response associated to them.
   * This function will allow the current instance of issue to retain the state of response of the given `issue`.
   *
   * @param phase - The phase in which you want to retain your responses.
   * @param issue - The issue which you want your current instance to retain from.
   */
  retainResponses(phase: Phase, issue: Issue) {
    this.issueComment = issue.issueComment;
    this.githubComments = issue.githubComments;
    switch (phase) {
      case Phase.issuesViewer:
        this.description = issue.description;
        break;
      default:
        break;
    }
  }

  /**
   * Updates the tester's responses and team response based on the given githubComment.
   * @param githubComment - A version of githubComment to update the issue with.
   */
  updateTesterResponse(githubComment: GithubComment): void {
    const template = new TesterResponseTemplate([githubComment]);
    this.issueComment = template.comment;
    this.teamResponse = template.teamResponse && template.teamResponse.content;
    this.testerResponses = template.testerResponse && template.testerResponse.testerResponses;
  }

  /**
   * Updates the tutor's resolution of the disputes with a new version of githubComment.
   * @param githubComment - A version of githubComment to update the dispute with.
   */
  updateDispute(githubComment: GithubComment): void {
    const todoTemplate = new TutorModerationTodoTemplate([githubComment]);
    this.issueComment = todoTemplate.comment;
    this.issueDisputes = todoTemplate.moderation.disputesToResolve.map((dispute, i) => {
      dispute.description = this.issueDisputes[i].description;
      return dispute;
    });
  }

  createGithubIssueDescription(): string {
    return `${this.description}\n${this.hiddenDataInDescription.toString()}`;
  }

  // Template url: https://github.com/CATcher-org/templates#dev-response-phase
  createGithubTeamResponse(): string {
    return (
      `# Team\'s Response\n${this.teamResponse}\n` +
      `## Duplicate status (if any):\n${this.duplicateOf ? `Duplicate of #${this.duplicateOf}` : `--`}`
    );
  }

  // Template url: https://github.com/CATcher-org/templates#tutor-moderation
  createGithubTutorResponse(): string {
    let tutorResponseString = '# Tutor Moderation\n\n';
    for (const issueDispute of this.issueDisputes) {
      tutorResponseString += issueDispute.toTutorResponseString();
    }
    return tutorResponseString;
  }

  // Template url: https://github.com/CATcher-org/templates#teams-response-1
  createGithubTesterResponse(): string {
    return (
      `# Team\'s Response\n${this.teamResponse}\n` +
      `# Items for the Tester to Verify\n${this.getTesterResponsesString(this.testerResponses)}`
    );
  }

  /**
   * Gets the number of unresolved disputes in an Issue.
   */
  numOfUnresolvedDisputes(): number {
    if (!this.issueDisputes) {
      return 0;
    }

    return this.issueDisputes.reduce((prev, current) => prev + Number(!current.isDone()), 0);
  }

  private getTesterResponsesString(testerResponses: TesterResponse[]): string {
    let testerResponsesString = '';
    for (const testerResponse of testerResponses) {
      testerResponsesString += testerResponse.toString();
    }
    return testerResponsesString;
  }
}

export interface Issues {
  [id: number]: Issue;
}

export const SEVERITY_ORDER = { '-': 0, VeryLow: 1, Low: 2, Medium: 3, High: 4 };

export const ISSUE_TYPE_ORDER = { '-': 0, DocumentationBug: 1, FeatureFlaw: 2, FunctionalityBug: 3 };

export enum STATUS {
  Incomplete = 'Incomplete',
  Done = 'Done'
}

export const IssuesFilter = {
  issuesViewer: {
    Student: 'NO_FILTER',
    Tutor: 'NO_FILTER',
    Admin: 'NO_FILTER'
  }
};
