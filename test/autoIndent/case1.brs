function autoIndent1(arg as Object) as void
    if cond then
        print "has cond"; cond
        if cond2 then print "has cond2"; cond2
    else if cond2 then
        print "cond2"; cond2
    else if cond3
        print "cond2"; cond3
    else
        print "not cond"; cond
    end if

    p = {
        x: 100
        y: 100
        fn: sub(arg as object)
            print "is p.fn"
        end sub
    }

    fn = sub()
        print "is fn"
    end sub

    for i=0 to 10
        print "i="; i
    end for
end function
