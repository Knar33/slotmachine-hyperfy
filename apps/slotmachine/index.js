import React, { useRef, useEffect, useState } from 'react'
import { DEG2RAD, useWorld, Euler, useSignal, useFields, useSyncState, randomInt } from 'hyperfy'
import { Tween } from './Tween'

export default function TreasureChest() {
  //hyperfy sdk function that gives us access to cool worldwide functions like getting the server time
  const world = useWorld();

  //wheel model references - variable names match the "ref" property on the model tag
  const wheel0Ref = useRef();
  const wheel1Ref = useRef();
  const wheel2Ref = useRef();
  const armRef = useRef();
  //audio object references - variable names match the "ref" property on the audio tag
  const winRef = useRef();
  const loseref = useRef();
  const spinningRef = useRef();
  const payoutRef = useRef();

  let worldUpdateCallback = null;

  //This gives us access to the state shared by all users, and a method (dispatch) to update the state for everyone
  const [state, dispatch] = useSyncState(state => state);

  //how many seconds the wheels spin for after pulling the handle
  const spinSpeed = 5;
  //This is 360 degrees * 10, the wheels will spin 10 rotations plus a random extra amount
  const spinBaseRotation = 3600;
  //how long does it take for the arm to lower before rising up again
  const armDownSpeed = 0.5;

  //useEffect is a function that runs after every render (but only when state.spinStartTime changes value, see the end of the function)
  useEffect(() => {
    //if spinStartTime is 0, return early because this means the server just started and nobody has spun yet (but this effect will run because the value "changed" on initialization)
    if (state.spinStartTime === 0) {
      return;
    }
    console.log("state.spinStartTime has been changed, useEffect running")

    //objectRef.current gives us access to the actual object in this scope so we can do stuff with it
    const wheel0 = wheel0Ref.current;
    const wheel1 = wheel1Ref.current;
    const wheel2 = wheel2Ref.current;
    const arm = armRef.current;
    const win = winRef.current;
    const lose = loseref.current;
    const spinning = spinningRef.current;
    const payout = payoutRef.current;

    spinning.play();

    //we need to create 3 empty objects and then fill them with a value using getRotation, which gives is the current rotation of each wheel
    const wheel0InitialRotation = {};
    const wheel1InitialRotation = {};
    const wheel2InitialRotation = {};
    wheel0.getRotation(wheel0InitialRotation);
    wheel1.getRotation(wheel1InitialRotation);
    wheel2.getRotation(wheel2InitialRotation);
    //we create a tween for each wheel, basically a funcion that advances From a number To another number, over a specified period of time (spinSpeed)
    const wheel0Tween = new Tween({ deg: wheel0InitialRotation.x / DEG2RAD }).to({ deg: state.spinCombination[0] * 60 + spinBaseRotation }, spinSpeed, Tween.QUAD_IN_OUT);
    const wheel1Tween = new Tween({ deg: wheel1InitialRotation.x / DEG2RAD }).to({ deg: state.spinCombination[1] * 60 + spinBaseRotation }, spinSpeed, Tween.QUAD_IN_OUT);
    const wheel2Tween = new Tween({ deg: wheel2InitialRotation.x / DEG2RAD }).to({ deg: state.spinCombination[2] * 60 + spinBaseRotation }, spinSpeed, Tween.QUAD_IN_OUT);
    //we need 2 tweens for the arm, one for going down (quickly) and one for going up over the remaining time
    const armTween1 = new Tween({ deg: 0 }).to({ deg: 85 }, armDownSpeed, Tween.QUAD_IN_OUT);
    const armTween2 = new Tween({ deg: 85 }).to({ deg: 0 }, spinSpeed - armDownSpeed, Tween.QUAD_IN_OUT)
    
    //this creates a function that is called by hyperfy everytime the game loop advances 
    //world.onUpdate returns a callback function that unsubscribes to the event, which we pass on as the return of the useEffect
    //if you return a callback function in a useEffect, that function will be ran right before the next useEffect runs (cleanuo) which unsubscribes to world updates
    //delta is how many seconds since the last time the world updated
    worldUpdateCallback = world.onUpdate(delta => {
      const worldTime = world.getServerTime();
      const spinProgress = worldTime - state.spinStartTime;
      //spinProgress is how many seconds have elapsed since we pulled the lever, so if that is greater than the spinSpeed then the spin is over
      if (spinProgress > spinSpeed)
      {
        console.log("Spin complete");
        //stop spinning sound
        spinning.stop();

        //check if it's a win (all 3 numbers in the combination are the same) or a loss, and play the appropriate sounds
        if (state.spinCombination[0] === state.spinCombination[1] && state.spinCombination[1] === state.spinCombination[2])
        {
          console.log("WINNER!");
          win.play();
          payout.play();
        }
        else 
        {
          console.log("LOSER! HAHAHA");
          lose.play();
        }

        wheel0.setRotationX(state.spinCombination[0] * 60 * DEG2RAD);
        wheel1.setRotationX(state.spinCombination[1] * 60 * DEG2RAD);
        wheel2.setRotationX(state.spinCombination[2] * 60 * DEG2RAD);

        //dispatch a state update setting state.spinStartTime to 0 - this tells alll players that the spin is completed and they need to perform cleanup and set the wheels back -3600 degrees so they spin fully next time
        console.log("Ending Spin");
        worldUpdateCallback();
      }
      else 
      {
        //tween.set basically advances the progress of the tween to the value we send.
        //if we have a tween with a duration of 10 seconds, setting the tween to 5 would give us the value halfway between the from and to values
        wheel0Tween.set(spinProgress);
        wheel1Tween.set(spinProgress);
        wheel2Tween.set(spinProgress);
        //set rotation of each wheel to their new tween value
        wheel0.setRotationX(wheel0Tween.value.deg * DEG2RAD);
        wheel1.setRotationX(wheel1Tween.value.deg * DEG2RAD);
        wheel2.setRotationX(wheel2Tween.value.deg * DEG2RAD);

        //we have a multi-part animation for the arm - if the time since we pulled the level (spinProgress) is less than the armDownSpeed, the arm isn't down yet so use that tween
        if (spinProgress < armDownSpeed) 
        {
          armTween1.set(spinProgress);
          arm.setRotationX(armTween1.value.deg * DEG2RAD);
        }
        //otherwise use the arm up tween
        else 
        {
          armTween2.set(spinProgress);
          arm.setRotationX(armTween2.value.deg * DEG2RAD);
        }
      }
    })
  }, [state.spinStartTime]) //this is why the effect only runs when state.spinStartTime changes

  //this runs whenever the lever is pulled (see below in the react tag onClick={spin})
  function spin()
  {
    console.log("Spin handle clicked on");
    //This prevents multiple clicks from dispatching a bunch of new events, which would restart the animation and cause bugs
    const worldTime = world.getServerTime();
    const spinProgress = worldTime - state.spinStartTime;
    if (spinProgress < spinSpeed) {
      console.log("Machine is already spinning");
      return;
    }
    console.log("Machine is not spinning, dispatch new spin state");
    //getServertime is how many seconds since the server started
    const newSpinStartTime = world.getServerTime();
    //this picks a value for each wheel
    const newCombination = [randomInt(0, 5), randomInt(0, 5), randomInt(0, 5)];
    //send these new values to everyone
    dispatch("spin", newSpinStartTime, newCombination);
  }

  //this is the actual react stuff that gets rendered
  return (
    <app>
      <rigidbody type="kinematic">
        <model ref={wheel0Ref} src="wheel.glb" position={[-.31, 1.1, 0]} />
        <model ref={wheel1Ref} src="wheel.glb" position={[0, 1.1, 0]} />
        <model ref={wheel2Ref} src="wheel.glb" position={[.31, 1.1, 0]} />
        <model src="slotmachine.glb" position={[-0.07, -.05, 0]} scale={2.6} />
        <model ref={armRef} src="arm.glb" onClick={spin} position={[0.66, 1.03, -0.32]} scale={2.8} />
        <audio ref={winRef} src="win.mp3" />
        <audio ref={loseref} src="lose.mp3" />
        <audio ref={spinningRef} src="spinning.mp3" />
        <audio ref={payoutRef} src="payout.mp3" />
      </rigidbody>
    </app>
  )
}

//if you are the first person to encounter an app, only person online etc, this sets the initial values for your state
const initialState = {
  spinStartTime: 0,
  spinCombination: [0, 0, 0]
}

//this hooks up the multiplayer state sync stuff. The actions object has functions that we can call using the dispatch function
//dispatch("spin", newSpinStartTime, newCombination) calls this spin function here, which updates the spinStartTime, which in turn triggers the useEffect to run and start updating the world
export function getStore(state = initialState) {
  return {
    state,
    actions: {
      spin(state, spinStartTime, spinCombination) {
        console.log("New spin state dispatched: ", spinStartTime, spinCombination);
        state.spinStartTime = spinStartTime;
        state.spinCombination = spinCombination;
      },
    },
  }
}