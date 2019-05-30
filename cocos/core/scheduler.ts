/****************************************************************************
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

/**
 * @module cc
 */
import IdGenerator from './utils/id-generator';
import {createMap} from './utils/js';

const MAX_POOL_SIZE = 20;

const idGenerator = new IdGenerator('Scheduler');

// data structures
/**
 * @en A list double-linked list used for "updates with priority"
 * @zh 用于“优先更新”的列表
 * @class ListEntry
 * @param {Object} target not retained (retained by hashUpdateEntry)
 * @param {Number} priority
 * @param {Boolean} paused
 * @param {Boolean} markedForDeletion selector will no longer be called and entry will be removed at end of the next tick
 */
class ListEntry {

    public static get = (target: any, priority: Number, paused: Boolean, markedForDeletion: Boolean) => {
        let result = ListEntry._listEntries.pop();
        if (result) {
            result.target = target;
            result.priority = priority;
            result.paused = paused;
            result.markedForDeletion = markedForDeletion;
        }
        else {
            result = new ListEntry(target, priority, paused, markedForDeletion);
        }
        return result;
    }

    public static put = (entry) => {
        if (ListEntry._listEntries.length < MAX_POOL_SIZE) {
            entry.target = null;
            ListEntry._listEntries.push(entry);
        }
    }

    private static _listEntries: any = [];

    public target: any;
    public priority: Number;
    public paused: Boolean;
    public markedForDeletion: Boolean;

    constructor (target: any, priority: Number, paused: Boolean, markedForDeletion: Boolean) {
        this.target = target;
        this.priority = priority;
        this.paused = paused;
        this.markedForDeletion = markedForDeletion;
    }
}

/**
 * @en A update entry list
 * @zh 更新条目列表
 * @class HashUpdateEntry
 * @param {Array} list Which list does it belong to ?
 * @param {ListEntry} entry entry in the list
 * @param {Object} target hash key (retained)
 * @param {function} callback
 */
class HashUpdateEntry {

    public static get = (list: any, entry: ListEntry, target: Object, callback: any) => {
        let result = HashUpdateEntry._hashUpdateEntries.pop();
        if (result) {
            result.list = list;
            result.entry = entry;
            result.target = target;
            result.callback = callback;
        }
        else {
            result = new HashUpdateEntry(list, entry, target, callback);
        }
        return result;
    }

    public static put = (entry) => {
        if (HashUpdateEntry._hashUpdateEntries.length < MAX_POOL_SIZE) {
            entry.list = entry.entry = entry.target = entry.callback = null;
            HashUpdateEntry._hashUpdateEntries.push(entry);
        }
    }

    private static _hashUpdateEntries: any = [];

    public list: any;
    public entry: ListEntry;
    public target: Object;
    public callback: any;

    constructor (list: any, entry: ListEntry, target: Object, callback: any) {
        this.list = list;
        this.entry = entry;
        this.target = target;
        this.callback = callback;
    }
}

/**
 * @en Hash Element used for "selectors with interval"
 * @zh “用于间隔选择”的哈希元素
 * @class HashTimerEntry
 * @param {Array} timers
 * @param {Object} target  hash key (retained)
 * @param {Number} timerIndex
 * @param {Timer} currentTimer
 * @param {Boolean} currentTimerSalvaged
 * @param {Boolean} paused
 */
class HashTimerEntry {

    public static get = (timers: any, target: Object, timerIndex: Number, currentTimer: any, currentTimerSalvaged: any, paused: any) => {
        let result = HashTimerEntry._hashTimerEntries.pop();
        if (result) {
            result.timers = timers;
            result.target = target;
            result.timerIndex = timerIndex;
            result.currentTimer = currentTimer;
            result.currentTimerSalvaged = currentTimerSalvaged;
            result.paused = paused;
        }
        else {
            result = new HashTimerEntry(timers, target, timerIndex, currentTimer, currentTimerSalvaged, paused);
        }
        return result;
    }

    public static put = (entry) => {
        if (HashTimerEntry._hashTimerEntries.length < MAX_POOL_SIZE) {
            entry.timers = entry.target = entry.currentTimer = null;
            HashTimerEntry._hashTimerEntries.push(entry);
        }
    }

    private static _hashTimerEntries: any = [];

    public timers: any;
    public target: Object;
    public timerIndex: Number;
    public currentTimer: any;
    public currentTimerSalvaged: any;
    public paused: any;

    constructor (timers: any, target: Object, timerIndex: Number, currentTimer: any, currentTimerSalvaged: any, paused: any){
        this.timers = timers;
        this.target = target;
        this.timerIndex = timerIndex;
        this.currentTimer = currentTimer;
        this.currentTimerSalvaged = currentTimerSalvaged;
        this.paused = paused;
    }
}

/*
 * Light weight timer
 */
class CallbackTimer {

    public static _timers: any = [];
    public static get = () => {
    return CallbackTimer._timers.pop() || new CallbackTimer();
    }
    public static put = (timer) => {
        if (CallbackTimer._timers.length < MAX_POOL_SIZE && !timer._lock) {
            timer._scheduler = timer._target = timer._callback = null;
            CallbackTimer._timers.push(timer);
        }
    }

    private _lock: boolean;
    private _scheduler: any;
    private _elapsed: number;
    private _runForever: boolean;
    private _useDelay: boolean;
    private _timesExecuted: number;
    private _repeat: number;
    private _delay: number;
    private  _interval: number;
    private _target: any;
    private _callback: any;

    constructor () {
        this._lock = false;
        this._scheduler = null;
        this._elapsed = -1;
        this._runForever = false;
        this._useDelay = false;
        this._timesExecuted = 0;
        this._repeat = 0;
        this._delay = 0;
        this._interval = 0;

        this._target = null;
        this._callback = null;
    }

    public initWithCallback (scheduler: any, callback: any, target: any, seconds: number, repeat: number, delay: number) {
        this._lock = false;
        this._scheduler = scheduler;
        this._target = target;
        this._callback = callback;

        this._elapsed = -1;
        this._interval = seconds;
        this._delay = delay;
        this._useDelay = (this._delay > 0);
        this._repeat = repeat;
        this._runForever = (this._repeat === cc.macro.REPEAT_FOREVER);
        return true;
    }
    /**
     * @return {Number} returns interval of timer
     */
    public getInterval () {
        return this._interval;
    }
    /**
     * @param {Number} interval set interval in seconds
     */
    public setInterval (interval) {
        this._interval = interval;
    }

    /**
     * triggers the timer
     * @param {Number} dt delta time
     */
    public update (dt: number) {
        if (this._elapsed === -1) {
            this._elapsed = 0;
            this._timesExecuted = 0;
        } else {
            this._elapsed += dt;
            if (this._runForever && !this._useDelay) {// standard timer usage
                if (this._elapsed >= this._interval) {
                    this.trigger();
                    this._elapsed = 0;
                }
            } else {// advanced usage
                if (this._useDelay) {
                    if (this._elapsed >= this._delay) {
                        this.trigger();

                        this._elapsed -= this._delay;
                        this._timesExecuted += 1;
                        this._useDelay = false;
                    }
                } else {
                    if (this._elapsed >= this._interval) {
                        this.trigger();

                        this._elapsed = 0;
                        this._timesExecuted += 1;
                    }
                }

                if (this._callback && !this._runForever && this._timesExecuted > this._repeat) {
                    this.cancel();
                }
            }
        }
    }

    public getCallback (){
        return this._callback;
    }

    public trigger () {
        if (this._target && this._callback) {
            this._lock = true;
            this._callback.call(this._target, this._elapsed);
            this._lock = false;
        }
    }

    public cancel () {
        // override
        this._scheduler.unschedule(this._callback, this._target);
    }
}

/**
 * @en
 * Scheduler is responsible of triggering the scheduled callbacks.<br>
 * You should not use NSTimer. Instead use this class.<br>
 * <br>
 * There are 2 different types of callbacks (selectors):<br>
 *     - update callback: the 'update' callback will be called every frame. You can customize the priority.<br>
 *     - custom callback: A custom callback will be called every frame, or with a custom interval of time<br>
 * <br>
 * The 'custom selectors' should be avoided when possible. It is faster,<br>
 * and consumes less memory to use the 'update callback'. *
 * @zh
 * Scheduler 是负责触发回调函数的类。<br>
 * 通常情况下，建议使用 cc.director.getScheduler() 来获取系统定时器。<br>
 * 有两种不同类型的定时器：<br>
 *     - update 定时器：每一帧都会触发。您可以自定义优先级。<br>
 *     - 自定义定时器：自定义定时器可以每一帧或者自定义的时间间隔触发。<br>
 * 如果希望每帧都触发，应该使用 update 定时器，使用 update 定时器更快，而且消耗更少的内存。
 *
 * @class Scheduler
 */
class Scheduler {
    /**
     * @en Priority level reserved for system services.
     * @zh 系统服务的优先级。
     * @property PRIORITY_SYSTEM
     */
    public static PRIORITY_SYSTEM: number = 1 << 31;

    /**
     * @en Minimum priority level for user scheduling.
     * @zh 用户调度最低优先级。
     * @property PRIORITY_NON_SYSTEM
     */
    public static PRIORITY_NON_SYSTEM: number = Scheduler.PRIORITY_SYSTEM + 1;

    private _timeScale: number;
    private _updatesNegList: any[];
    private _updates0List: any[];
    private _updatesPosList: any[];
    private _hashForUpdates: any;
    private _hashForTimers: any;
    private _currentTarget: any;
    private _currentTargetSalvaged: boolean;
    private _updateHashLocked: boolean;
    private _arrayForTimers;

    constructor () {
        this._timeScale = 1.0;
        this._updatesNegList = [];  // list of priority < 0
        this._updates0List = [];    // list of priority == 0
        this._updatesPosList = [];  // list of priority > 0
        this._hashForUpdates = createMap(true);  // hash used to fetch quickly the list entries for pause, delete, etc
        this._hashForTimers = createMap(true);   // Used for "selectors with interval"
        this._currentTarget = null;
        this._currentTargetSalvaged = false;
        this._updateHashLocked = false; // If true unschedule will not remove anything from a hash. Elements will only be marked for deletion.

        this._arrayForTimers = [];  // Speed up indexing
        // this._arrayForUpdates = [];   // Speed up indexing
    }

    // -----------------------public method-------------------------
    /**
     * @en This method should be called for any target which needs to schedule tasks, and this method should be called before any scheduler API usage.<bg>
     * This method will add a `_id` property if it doesn't exist.
     * @zh 任何需要用 Scheduler 管理任务的对象主体都应该调用这个方法，并且应该在调用任何 Scheduler API 之前调用这个方法。<bg>
     * 这个方法会给对象添加一个 `_id` 属性，如果这个属性不存在的话。
     * @method enableForTarget
     * @param {Object} target
     */
    public enableForTarget (target) {
        if (!target._id) {
            if (target.__instanceId) {
                cc.warnID(1513);
            }
            else {
                target._id = idGenerator.getNewId();
            }
        }
    }

    /**
     * @en
     * Modifies the time of all scheduled callbacks.<br>
     * You can use this property to create a 'slow motion' or 'fast forward' effect.<br>
     * Default is 1.0. To create a 'slow motion' effect, use values below 1.0.<br>
     * To create a 'fast forward' effect, use values higher than 1.0.<br>
     * Note：It will affect EVERY scheduled selector / action.
     * @zh
     * 设置时间间隔的缩放比例。<br>
     * 您可以使用这个方法来创建一个 “slow motion（慢动作）” 或 “fast forward（快进）” 的效果。<br>
     * 默认是 1.0。要创建一个 “slow motion（慢动作）” 效果,使用值低于 1.0。<br>
     * 要使用 “fast forward（快进）” 效果，使用值大于 1.0。<br>
     * 注意：它影响该 Scheduler 下管理的所有定时器。
     * @method setTimeScale
     * @param {Number} timeScale
     */
    public setTimeScale (timeScale) {
        this._timeScale = timeScale;
    }

    /**
     * @en Returns time scale of scheduler.
     * @zh 获取时间间隔的缩放比例。
     * @method getTimeScale
     * @return {Number}
     */
    public getTimeScale (): number {
        return this._timeScale;
    }

    /**
     * @en 'update' the scheduler. (You should NEVER call this method, unless you know what you are doing.)
     * @zh update 调度函数。(不应该直接调用这个方法，除非完全了解这么做的结果)
     * @method update
     * @param {Number} dt delta time
     */
    public update (dt) {
        this._updateHashLocked = true;
        if (this._timeScale !== 1) {
            dt *= this._timeScale;
        }

        let i: number;
        let list;
        let len: number;
        let entry;

        for (i = 0, list = this._updatesNegList, len = list.length; i < len; i++){
            entry = list[i];
            if (!entry.paused && !entry.markedForDeletion) {
                entry.target.update(dt);
            }
        }

        for ( i = 0, list = this._updates0List, len = list.length; i < len; i++){
            entry = list[i];
            if (!entry.paused && !entry.markedForDeletion) {
                entry.target.update(dt);
            }
        }

        for ( i = 0, list = this._updatesPosList, len = list.length; i < len; i++){
            entry = list[i];
            if (!entry.paused && !entry.markedForDeletion) {
                entry.target.update(dt);
            }
        }

        // Iterate over all the custom selectors
        let elt;
        const arr = this._arrayForTimers;
        for ( i = 0; i < arr.length; i++){
            elt = arr[i];
            this._currentTarget = elt;
            this._currentTargetSalvaged = false;

            if (!elt.paused){
                // The 'timers' array may change while inside this loop
                for (elt.timerIndex = 0; elt.timerIndex < elt.timers.length; ++(elt.timerIndex)){
                    elt.currentTimer = elt.timers[elt.timerIndex];
                    elt.currentTimerSalvaged = false;

                    elt.currentTimer.update(dt);
                    elt.currentTimer = null;
                }
            }

            // only delete currentTarget if no actions were scheduled during the cycle (issue #481)
            if (this._currentTargetSalvaged && this._currentTarget.timers.length === 0) {
                this._removeHashElement(this._currentTarget);
                --i;
            }
        }

        // delete all updates that are marked for deletion
        // updates with priority < 0
        for ( i = 0, list = this._updatesNegList; i < list.length; ){
            entry = list[i];
            if (entry.markedForDeletion) {
                this._removeUpdateFromHash(entry);
            }
            else {
                i++;
            }
        }

        for ( i = 0, list = this._updates0List; i < list.length; ){
            entry = list[i];
            if (entry.markedForDeletion) {
                this._removeUpdateFromHash(entry);
            }
            else {
                i++;
            }
        }

        for ( i = 0, list = this._updatesPosList; i < list.length; ){
            entry = list[i];
            if (entry.markedForDeletion) {
                this._removeUpdateFromHash(entry);
            }
            else {
                i++;
            }
        }

        this._updateHashLocked = false;
        this._currentTarget = null;
    }

    /**
     * @en
     * <p>
     *   The scheduled method will be called every 'interval' seconds.<br/>
     *   If paused is YES, then it won't be called until it is resumed.<br/>
     *   If 'interval' is 0, it will be called every frame, but if so, it recommended to use 'scheduleUpdateForTarget:' instead.<br/>
     *   If the callback function is already scheduled, then only the interval parameter will be updated without re-scheduling it again.<br/>
     *   repeat let the action be repeated repeat + 1 times, use cc.macro.REPEAT_FOREVER to let the action run continuously<br/>
     *   delay is the amount of time the action will wait before it'll start<br/>
     * </p>
     * @zh
     * 指定回调函数，调用对象等信息来添加一个新的定时器。<br/>
     * 如果 paused 值为 true，那么直到 resume 被调用才开始计时。<br/>
     * 当时间间隔达到指定值时，设置的回调函数将会被调用。<br/>
     * 如果 interval 值为 0，那么回调函数每一帧都会被调用，但如果是这样，
     * 建议使用 scheduleUpdateForTarget 代替。<br/>
     * 如果回调函数已经被定时器使用，那么只会更新之前定时器的时间间隔参数，不会设置新的定时器。<br/>
     * repeat 值可以让定时器触发 repeat + 1 次，使用 cc.macro.REPEAT_FOREVER
     * 可以让定时器一直循环触发。<br/>
     * delay 值指定延迟时间，定时器会在延迟指定的时间之后开始计时。
     * @method schedule
     * @param {Function} callback
     * @param {Object} target
     * @param {Number} interval
     * @param {Number} [repeat=cc.macro.REPEAT_FOREVER]
     * @param {Number} [delay=0]
     * @param {Boolean} paused
     */
    public schedule (callback: Function, target: any, interval: number, repeat: number, delay: number, paused?: boolean) {
        'use strict';
        if (typeof callback !== 'function') {
            const tmp = callback;
            callback = target;
            target = tmp;
        }
        // selector, target, interval, repeat, delay, paused
        // selector, target, interval, paused
        if (arguments.length === 4 || arguments.length === 5) {
            paused = !!repeat;
            repeat = cc.macro.REPEAT_FOREVER;
            delay = 0;
        }

        cc.assertID(target, 1502);

        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }
        let element = this._hashForTimers[targetId];
        if (!element) {
            // Is this the 1st element ? Then set the pause level to all the callback_fns of this target
            element = HashTimerEntry.get(null, target, 0, null, null, paused);
            this._arrayForTimers.push(element);
            this._hashForTimers[targetId] = element;
        } else if (element.paused !== paused) {
            cc.warnID(1511);
        }

        let timer;
        let i;
        if (element.timers == null) {
            element.timers = [];
        }
        else {
            for (i = 0; i < element.timers.length; ++i) {
                timer = element.timers[i];
                if (timer && callback === timer._callback) {
                    cc.logID(1507, timer.getInterval(), interval);
                    timer._interval = interval;
                    return;
                }
            }
        }

        timer = CallbackTimer.get();
        timer.initWithCallback(this, callback, target, interval, repeat, delay);
        element.timers.push(timer);

        if (this._currentTarget === element && this._currentTargetSalvaged) {
            this._currentTargetSalvaged = false;
        }
    }

    /**
     * @en
     * Schedules the update callback for a given target,
     * During every frame after schedule started, the "update" function of target will be invoked.
     * @zh
     * 使用指定的优先级为指定的对象设置 update 定时器。<br>
     * update 定时器每一帧都会被触发，触发时自动调用指定对象的 "update" 函数。<br>
     * 优先级的值越低，定时器被触发的越早。
     * @method scheduleUpdate
     * @param {Object} target
     * @param {Number} priority
     * @param {Boolean} paused
     */
    public scheduleUpdate (target: any, priority: Number, paused: Boolean) {
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }
        const hashElement = this._hashForUpdates[targetId];
        if (hashElement && hashElement.entry){
            // check if priority has changed
            if (hashElement.entry.priority !== priority){
                if (this._updateHashLocked){
                    cc.logID(1506);
                    hashElement.entry.markedForDeletion = false;
                    hashElement.entry.paused = paused;
                    return;
                }else{
                    // will be added again outside if (hashElement).
                    this.unscheduleUpdate(target);
                }
            }else{
                hashElement.entry.markedForDeletion = false;
                hashElement.entry.paused = paused;
                return;
            }
        }

        const listElement = ListEntry.get(target, priority, paused, false);
        let ppList;

        // most of the updates are going to be 0, that's way there
        // is an special list for updates with priority 0
        if (priority === 0) {
            ppList = this._updates0List;
            this._appendIn(ppList, listElement);
        }
        else {
            ppList = priority < 0 ? this._updatesNegList : this._updatesPosList;
            this._priorityIn(ppList, listElement, priority);
        }

        // update hash entry for quick access
        this._hashForUpdates[targetId] = HashUpdateEntry.get(ppList, listElement, target, null);
    }

    /**
     * @en
     * Unschedules a callback for a callback and a given target.<br>
     * If you want to unschedule the "update", use `unscheduleUpdate()`
     * @zh
     * 根据指定的回调函数和调用对象。<br>
     * 如果需要取消 update 定时器，请使用 unscheduleUpdate()。
     * @method unschedule
     * @param {Function} callback The callback to be unscheduled
     * @param {Object} target The target bound to the callback.
     */
    public unschedule (callback, target) {
        // callback, target

        // explicity handle nil arguments when removing an object
        if (!target || !callback) {
            return;
        }
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        const self = this;
        const element = self._hashForTimers[targetId];
        if (element) {
            const timers = element.timers;
            for (let i = 0, li = timers.length; i < li; i++) {
                const timer = timers[i];
                if (callback === timer._callback) {
                    if ((timer === element.currentTimer) && (!element.currentTimerSalvaged)) {
                        element.currentTimerSalvaged = true;
                    }
                    timers.splice(i, 1);
                    CallbackTimer.put(timer);
                    // update timerIndex in case we are in tick;, looping over the actions
                    if (element.timerIndex >= i) {
                        element.timerIndex--;
                    }

                    if (timers.length === 0) {
                        if (self._currentTarget === element) {
                            self._currentTargetSalvaged = true;
                        } else {
                            self._removeHashElement(element);
                        }
                    }
                    return;
                }
            }
        }
    }

    /**
     * @en Unschedules the update callback for a given target.
     * @zh 取消指定对象的 update 定时器。
     * @method unscheduleUpdate
     * @param {Object} target The target to be unscheduled.
     */
    public unscheduleUpdate (target) {
        if (!target) {
            return;
        }
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        const element = this._hashForUpdates[targetId];
        if (element) {
            if (this._updateHashLocked) {
                element.entry.markedForDeletion = true;
            } else {
                this._removeUpdateFromHash(element.entry);
            }
        }
    }

    /**
     * @en
     * Unschedules all scheduled callbacks for a given target.
     * This also includes the "update" callback.
     * @zh 取消指定对象的所有定时器，包括 update 定时器。
     * @method unscheduleAllForTarget
     * @param {Object} target The target to be unscheduled.
     */
    public unscheduleAllForTarget (target) {
        // explicit nullptr handling
        if (!target){
            return;
        }
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        // Custom Selectors
        const element = this._hashForTimers[targetId];
        if (element) {
            const timers = element.timers;
            if (timers.indexOf(element.currentTimer) > -1 &&
                (!element.currentTimerSalvaged)) {
                element.currentTimerSalvaged = true;
            }
            for (let i = 0, l = timers.length; i < l; i++) {
                CallbackTimer.put(timers[i]);
            }
            timers.length = 0;

            if (this._currentTarget === element){
                this._currentTargetSalvaged = true;
            }else{
                this._removeHashElement(element);
            }
        }

        // update selector
        this.unscheduleUpdate(target);
    }

    /**
     * @en
     * Unschedules all scheduled callbacks from all targets including the system callbacks.<br/>
     * You should NEVER call this method, unless you know what you are doing.
     * @zh
     * 取消所有对象的所有定时器，包括系统定时器。<br/>
     * 不用调用此函数，除非你确定你在做什么。
     * @method unscheduleAll
     */
    public unscheduleAll (){
        this.unscheduleAllWithMinPriority(cc.Scheduler.PRIORITY_SYSTEM);
    }

    /**
     * @en
     * Unschedules all callbacks from all targets with a minimum priority.<br/>
     * You should only call this with `PRIORITY_NON_SYSTEM_MIN` or higher.
     * @zh
     * 取消所有优先级的值大于指定优先级的定时器。<br/>
     * 你应该只取消优先级的值大于 PRIORITY_NON_SYSTEM_MIN 的定时器。
     * @method unscheduleAllWithMinPriority
     * @param {Number} minPriority The minimum priority of selector to be unscheduled. Which means, all selectors which
     *        priority is higher than minPriority will be unscheduled.
     */
    public unscheduleAllWithMinPriority (minPriority: number){
        // Custom Selectors
        let i;
        let element;
        const arr = this._arrayForTimers;
        for ( i = arr.length - 1; i >= 0; i--) {
            element = arr[i];
            this.unscheduleAllForTarget(element.target);
        }

        // Updates selectors
        let entry;
        let temp_length = 0;
        if (minPriority < 0){
            for ( i = 0; i < this._updatesNegList.length; ) {
                temp_length = this._updatesNegList.length;
                entry = this._updatesNegList[i];
                if (entry && entry.priority >= minPriority) {
                    this.unscheduleUpdate(entry.target);
                }
                if (temp_length === this._updatesNegList.length) {
                    i++;
                }
            }
        }

        if (minPriority <= 0 ) {
            for ( i = 0; i < this._updates0List.length; ) {
                temp_length = this._updates0List.length;
                entry = this._updates0List[i];
                if (entry) {
                    this.unscheduleUpdate(entry.target);
                }
                if (temp_length === this._updates0List.length) {
                    i++;
                }
            }
        }

        for ( i = 0; i < this._updatesPosList.length; ) {
            temp_length = this._updatesPosList.length;
            entry = this._updatesPosList[i];
            if ( entry && entry.priority >= minPriority ) {
                this.unscheduleUpdate(entry.target);
            }
            if (temp_length === this._updatesPosList.length) {
                i++;
            }
        }
    }

    /**
     * @en Checks whether a callback for a given target is scheduled.
     * @zh 检查指定的回调函数和回调对象组合是否存在定时器。
     * @method isScheduled
     * @param {Function} callback The callback to check.
     * @param {Object} target The target of the callback.
     * @return {Boolean} True if the specified callback is invoked, false if not.
     */
    public isScheduled (callback, target){
        // key, target
        // selector, target
        cc.assertID(callback, 1508);
        cc.assertID(target, 1509);
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        const element = this._hashForTimers[targetId];

        if (!element) {
            return false;
        }

        if (element.timers == null){
            return false;
        }
        else {
            const timers = element.timers;
            // tslint:disable-next-line: prefer-for-of
            for (let i = 0; i < timers.length; ++i) {
                const timer =  timers[i];
                if (callback === timer._callback){
                    return true;
                }
            }
            return false;
        }
    }

    /**
     * @en
     * Pause all selectors from all targets.<br/>
     * You should NEVER call this method, unless you know what you are doing.
     * @zh
     * 暂停所有对象的所有定时器。<br/>
     * 不要调用这个方法，除非你知道你正在做什么。
     * @method pauseAllTargets
     */
    public pauseAllTargets () {
        return this.pauseAllTargetsWithMinPriority(cc.Scheduler.PRIORITY_SYSTEM);
    }

    /**
     * @en
     * Pause all selectors from all targets with a minimum priority. <br/>
     * You should only call this with kCCPriorityNonSystemMin or higher.
     * @zh
     * 暂停所有优先级的值大于指定优先级的定时器。<br/>
     * 你应该只暂停优先级的值大于 PRIORITY_NON_SYSTEM_MIN 的定时器。
     * @method pauseAllTargetsWithMinPriority
     * @param {Number} minPriority
     */
    public pauseAllTargetsWithMinPriority (minPriority: number) {
        const idsWithSelectors: any = [];

        const self = this;
        let element;
        const locArrayForTimers = self._arrayForTimers;
        let i;
        let li;
        // Custom Selectors
        for (i = 0, li = locArrayForTimers.length; i < li; i++) {
            element = locArrayForTimers[i];
            if (element) {
                element.paused = true;
                idsWithSelectors.push(element.target);
            }
        }

        let entry;
        if (minPriority < 0) {
            for (i = 0; i < this._updatesNegList.length; i++) {
                entry = this._updatesNegList[i];
                if (entry) {
                    if (entry.priority >= minPriority) {
                        entry.paused = true;
                        idsWithSelectors.push(entry.target);
                    }
                }
            }
        }

        if (minPriority <= 0) {
            for (i = 0; i < this._updates0List.length; i++) {
                entry = this._updates0List[i];
                if (entry) {
                    entry.paused = true;
                    idsWithSelectors.push(entry.target);
                }
            }
        }

        for (i = 0; i < this._updatesPosList.length; i++) {
            entry = this._updatesPosList[i];
            if (entry) {
                if (entry.priority >= minPriority) {
                    entry.paused = true;
                    idsWithSelectors.push(entry.target);
                }
            }
        }

        return idsWithSelectors;
    }

    /**
     * @en
     * Resume selectors on a set of targets.<br/>
     * This can be useful for undoing a call to pauseAllCallbacks.
     * @zh
     * 恢复指定数组中所有对象的定时器。<br/>
     * 这个函数是 pauseAllCallbacks 的逆操作。
     * @method resumeTargets
     * @param {Array} targetsToResume
     */
    public resumeTargets (targetsToResume) {
        if (!targetsToResume) {
            return;
        }
        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < targetsToResume.length; i++) {
            this.resumeTarget(targetsToResume[i]);
        }
    }

    /**
     * @en
     * Pauses the target.<br/>
     * All scheduled selectors/update for a given target won't be 'ticked' until the target is resumed.<br/>
     * If the target is not present, nothing happens.
     * @zh
     * 暂停指定对象的定时器。<br/>
     * 指定对象的所有定时器都会被暂停。<br/>
     * 如果指定的对象没有定时器，什么也不会发生。
     * @method pauseTarget
     * @param {Object} target
     */
    public pauseTarget (target) {
        cc.assertID(target, 1503);
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        // customer selectors
        const self = this;
        const element = self._hashForTimers[targetId];
        if (element) {
            element.paused = true;
        }

        // update callback
        const elementUpdate = self._hashForUpdates[targetId];
        if (elementUpdate) {
            elementUpdate.entry.paused = true;
        }
    }

    /**
     * @en
     * Resumes the target.<br/>
     * The 'target' will be unpaused, so all schedule selectors/update will be 'ticked' again.<br/>
     * If the target is not present, nothing happens.
     * @zh
     * 恢复指定对象的所有定时器。<br/>
     * 指定对象的所有定时器将继续工作。<br/>
     * 如果指定的对象没有定时器，什么也不会发生。
     * @method resumeTarget
     * @param {Object} target
     */
    public resumeTarget (target) {
        cc.assertID(target, 1504);
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        // custom selectors
        const self = this;
        const element = self._hashForTimers[targetId];
        if (element) {
            element.paused = false;
        }

        // update callback
        const elementUpdate = self._hashForUpdates[targetId];
        if (elementUpdate) {
            elementUpdate.entry.paused = false;
        }
    }

    /**
     * @en Returns whether or not the target is paused.
     * @zh 返回指定对象的定时器是否处于暂停状态。
     * @method isTargetPaused
     * @param {Object} target
     * @return {Boolean}
     */
    public isTargetPaused (target) {
        cc.assertID(target, 1505);
        let targetId = target._id;
        if (!targetId) {
            if (target.__instanceId) {
                cc.warnID(1513);
                targetId = target._id = target.__instanceId;
            }
            else {
                cc.errorID(1510);
            }
        }

        // Custom selectors
        const element = this._hashForTimers[targetId];
        if (element) {
            return element.paused;
        }
        const elementUpdate = this._hashForUpdates[targetId];
        if (elementUpdate) {
            return elementUpdate.entry.paused;
        }
        return false;
    }

    // -----------------------private method----------------------
    private _removeHashElement (element) {
        delete this._hashForTimers[element.target._id];
        const arr = this._arrayForTimers;
        for (let i = 0, l = arr.length; i < l; i++) {
            if (arr[i] === element) {
                arr.splice(i, 1);
                break;
            }
        }
        HashTimerEntry.put(element);
    }

    private _removeUpdateFromHash (entry) {
        const targetId = entry.target._id;
        const self = this;
        const element = self._hashForUpdates[targetId];
        if (element) {
            // Remove list entry from list
            const list = element.list;
            const listEntry = element.entry;
            for (let i = 0, l = list.length; i < l; i++) {
                if (list[i] === listEntry) {
                    list.splice(i, 1);
                    break;
                }
            }

            delete self._hashForUpdates[targetId];
            ListEntry.put(listEntry);
            HashUpdateEntry.put(element);
        }
    }

    private _priorityIn (ppList, listElement, priority) {
        for (let i = 0; i < ppList.length; i++){
            if (priority < ppList[i].priority) {
                ppList.splice(i, 0, listElement);
                return;
            }
        }
        ppList.push(listElement);
    }

    private _appendIn (ppList, listElement) {
        ppList.push(listElement);
    }

}

cc.Scheduler = Scheduler;
export default Scheduler;