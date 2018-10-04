import { Inject, Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { User as OidcUser } from 'oidc-client';
import { Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, tap } from 'rxjs/operators';
import {
  OidcActionTypes,
  OidcError,
  OnIdentityChanged,
  OnIdentityEstablished,
  OnIdentityRemoved,
  OnUserLoaded,
  SignInSilent,
  SilentRenewError,
  UserDoneLoading,
  UserFound
} from '../actions/oidc.action';
import { OidcService } from '../services/oidc.service';

@Injectable()
export class OidcEffects {
  constructor(private actions$: Actions, @Inject(OidcService) private oidcService: OidcService) {}

  @Effect()
  getOicdUser$ = this.actions$.pipe(
    ofType(OidcActionTypes.GetOidcUser),
    tap(() => console.log('Effect getOidcUser  - Getting user from UserManager')),
    switchMap(() =>
      this.oidcService.getOidcUser().pipe(
        tap(userData => console.log('Effect getOidcUser  - Got User', userData)),
        switchMap((userData: OidcUser) => {
          const r: Action[] = [new UserFound(userData), new UserDoneLoading()];
          // user does not exist
          if (userData == null) {
            return r;
          }
          // user expired, initiate silent sign-in
          if (userData.expired === true) {
            r.push(new SignInSilent());
          } else {
            // user has been reneewed
            r.push(new OnIdentityChanged(), new OnIdentityEstablished());
          }
          return r;
        }),
        catchError(error => {
          console.log('Effect getOidcUser - Caught error get user', error);
          return of(new UserDoneLoading());
        })
      )
    )
  );
  @Effect()
  removeOidcUser$ = this.actions$.pipe(
    ofType(OidcActionTypes.RemoveOidcUser),
    tap(() => console.log('Effect removeOidcUser')),
    concatMap(() => {
      return this.oidcService.removeOidcUser().pipe(
        concatMap(() => [new UserDoneLoading()]),
        catchError(error => [new OidcError(error)]) //
      );
    })
  );

  @Effect()
  onUserLoaded$: Observable<Action> = this.actions$.pipe(
    ofType(OidcActionTypes.OnUserLoaded),
    map((action: OnUserLoaded) => action.payload),
    tap((userData: OidcUser) => console.log('Effect onUserLoaded - ', { userData })),
    switchMap((userData: OidcUser) => {
      return [new UserFound(userData)];
    })
  );

  @Effect()
  signInSilent$ = this.actions$.pipe(
    ofType(OidcActionTypes.SignInSilent),
    tap(() => console.log('Effect SignInSilent - Trigger silent signin manually')),
    switchMap(() =>
      this.oidcService.signinSilent().pipe(
        tap((userData: OidcUser) => console.log('Effect SignInSilent - Got user from silent sign in', userData)),
        switchMap((userData: OidcUser) => {
          return [new UserFound(userData), new OnIdentityChanged(), new OnIdentityEstablished()];
        }),
        catchError(error => {
          console.log('Effect SignInSilent - Caught error silent renew', error);
          // Something went wrong renewing the access token.
          // Set loading done so the auth guard will resolve.
          return of(new SilentRenewError(error), new UserDoneLoading());
        })
      )
    )
  );

  @Effect({ dispatch: false })
  signInSilentError$ = this.actions$.pipe(
    ofType(OidcActionTypes.SilentRenewError),
    tap(error => console.log('Effect SilentRenewError - There was an error renewing user token', error))
  );

  @Effect()
  onUserSignedOut$ = this.actions$.pipe(
    ofType(OidcActionTypes.OnUserSignedOut),
    tap(() => console.log('Effect OnUserSignedOut')),
    switchMap(() => [new OnIdentityRemoved()])
  );
}
