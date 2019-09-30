import { OperatorFunction, Observable, of } from 'rxjs';
import { map, flatMap } from 'rxjs/operators';

type DatabagOperator<A, B> = OperatorFunction<Databag<A>, Databag<B>>;
type DynamicOperator<A, B> = (db: Databag<A>) => OperatorFunction<A, B>;
type ValueGenerator<A> = (bag: Databag<A>) => any;

export class Databag<T> {
  private additional = {};
  private constructor(public data: T) {}

  set(name: string, value: any) {
    this.additional[name] = value;
    return this;
  }

  setWithBag(name: string, generateValue: ValueGenerator<T>) {
    this.additional[name] = generateValue(this);
    return this;
  }

  setMany(obj: { [k: string]: any }) {
    this.additional = {
      ...this.additional,
      ...obj
    };
    return this;
  }

  get<A>(name: string): A {
    return this.additional[name];
  }

  static wrap<A>(): OperatorFunction<A, Databag<A>> {
    return (obs: Observable<A>) => obs.pipe(map(val => new Databag(val)));
  }

  static unwrap<A>(): OperatorFunction<Databag<A>, A> {
    return (obs: Observable<Databag<A>>) => obs.pipe(map(val => val.data));
  }

  static rewrap<A, B>(bag: Databag<A>): OperatorFunction<B, Databag<B>> {
    return map((value: B) => {
      const newBag = new Databag(value);
      newBag.additional = bag.additional;
      return newBag;
    });
  }

  static inside<A, B>(op: OperatorFunction<A, B>): DatabagOperator<A, B> {
    return (obs: Observable<Databag<A>>) => obs.pipe(
      flatMap((bag: Databag<A>) => of(bag.data).pipe(op, Databag.rewrap(bag)))
    );
  }

  static insideWithBag<A, B>(op: DynamicOperator<A, B>): DatabagOperator<A, B> {
    return (obs: Observable<Databag<A>>) => obs.pipe(
      flatMap((bag: Databag<A>) => of(bag.data).pipe(op(bag), Databag.rewrap(bag)))
    );
  }

  static set<A>(name: string, value: any): DatabagOperator<A, A> {
    return map(databag => databag.set(name, value));
  }

  static setWithBag<A>(name: string, generateValue: ValueGenerator<A>): DatabagOperator<A, A> {
    return map(databag => databag.setWithBag(name, generateValue));
  }

  static setMany<A>(obj: { [k: string]: any }): DatabagOperator<A, A> {
    return map(databag => databag.setMany(obj));
  }

  static get<A, B = unknown>(name: string): OperatorFunction<Databag<B>, A> {
    return map(databag => databag.get<A>(name));
  }
}
