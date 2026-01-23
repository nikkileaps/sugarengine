export interface Component {
  readonly type: string;
}

export type ComponentClass<T extends Component = Component> = {
  new (...args: never[]): T;
  readonly type: string;
};
